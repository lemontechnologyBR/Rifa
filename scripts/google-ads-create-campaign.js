#!/usr/bin/env node
/**
 * Cria campanha Search no Google Ads (budget + campanha + ad group + keywords + RSA).
 *
 * Uso:
 *   npm run google-ads:create-campaign
 *   node scripts/google-ads-create-campaign.js --name "Minha Campanha" --budget 15
 *
 * A campanha é criada PAUSADA por segurança.
 */
const {
  loadConfig,
  getAccessToken,
  mutate,
  search
} = require('../lib/googleAdsClient');
const { loadVouRifarKeywords } = require('../lib/googleAdsKeywords');
const { loadVouRifarAdCopy } = require('../lib/googleAdsAdCopy');

const GEO_BRAZIL = 'geoTargetConstants/2076';
const LANG_PORTUGUESE = 'languageConstants/1014';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    name: `VouRifar Search ${new Date().toISOString().slice(0, 10)}`,
    budget: 10,
    url: process.env.APP_URL || 'https://vourifar.com.br',
    customerId: null,
    keywords: loadVouRifarKeywords(),
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) opts.name = args[++i];
    else if (args[i] === '--budget' && args[i + 1]) opts.budget = parseFloat(args[++i]);
    else if (args[i] === '--url' && args[i + 1]) opts.url = args[++i];
    else if (args[i] === '--customer-id' && args[i + 1]) opts.customerId = args[++i].replace(/\D/g, '');
    else if (args[i] === '--dry-run') opts.dryRun = true;
  }

  return opts;
}

function budgetMicros(reais) {
  return String(Math.round(reais * 1_000_000));
}

function uniqSuffix() {
  return Date.now().toString(36);
}

async function createSearchCampaign(accessToken, config, opts) {
  const { customerId } = config;
  const suffix = uniqSuffix();
  const budgetName = `VouRifar Budget ${suffix}`;
  const campaignName = opts.name;

  console.log('\n--- 1/6 Budget diário ---');
  console.log(`Nome: ${budgetName} | Valor: R$ ${opts.budget}/dia`);

  const budgetRes = await mutate(accessToken, config, 'campaignBudgets', [{
    create: {
      name: budgetName,
      amountMicros: budgetMicros(opts.budget),
      deliveryMethod: 'STANDARD',
      explicitlyShared: false
    }
  }]);

  const budgetResource = budgetRes.results[0].resourceName;
  console.log('OK:', budgetResource);

  console.log('\n--- 2/6 Campanha Search (PAUSED) ---');
  const campaignRes = await mutate(accessToken, config, 'campaigns', [{
    create: {
      name: campaignName,
      advertisingChannelType: 'SEARCH',
      status: 'PAUSED',
      campaignBudget: budgetResource,
      manualCpc: {},
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      networkSettings: {
        targetGoogleSearch: true,
        targetSearchNetwork: true,
        targetContentNetwork: false,
        targetPartnerSearchNetwork: false
      }
    }
  }]);

  const campaignResource = campaignRes.results[0].resourceName;
  console.log('OK:', campaignResource);

  console.log('\n--- 3/6 Targeting (Brasil + Português) ---');
  await mutate(accessToken, config, 'campaignCriteria', [
    {
      create: {
        campaign: campaignResource,
        location: { geoTargetConstant: GEO_BRAZIL }
      }
    },
    {
      create: {
        campaign: campaignResource,
        language: { languageConstant: LANG_PORTUGUESE }
      }
    }
  ]);
  console.log('OK: Brasil + Português');

  console.log('\n--- 4/6 Ad Group ---');
  const adGroupRes = await mutate(accessToken, config, 'adGroups', [{
    create: {
      name: `Ad Group ${suffix}`,
      campaign: campaignResource,
      type: 'SEARCH_STANDARD',
      status: 'ENABLED',
      cpcBidMicros: '1000000'
    }
  }]);

  const adGroupResource = adGroupRes.results[0].resourceName;
  console.log('OK:', adGroupResource);

  console.log('\n--- 5/6 Keywords ---');
  const keywordOps = opts.keywords.map((text) => ({
    create: {
      adGroup: adGroupResource,
      status: 'ENABLED',
      keyword: { text, matchType: 'PHRASE' }
    }
  }));
  await mutate(accessToken, config, 'adGroupCriteria', keywordOps);
  console.log('OK:', opts.keywords.join(', '));

  console.log('\n--- 6/6 Anúncio RSA ---');
  const adCopy = loadVouRifarAdCopy();
  const adRes = await mutate(accessToken, config, 'adGroupAds', [{
    create: {
      adGroup: adGroupResource,
      status: 'ENABLED',
      ad: {
        finalUrls: [opts.url.replace(/\/$/, '')],
        responsiveSearchAd: {
          headlines: adCopy.headlines.map((text) => ({ text })),
          descriptions: adCopy.descriptions.map((text) => ({ text }))
        }
      }
    }
  }]);

  const adResource = adRes.results[0].resourceName;
  console.log('OK:', adResource);

  return { campaignResource, budgetResource, adGroupResource, adResource };
}

async function verifyCampaign(accessToken, config, campaignResource) {
  const campaignId = campaignResource.split('/').pop();
  const data = await search(
    accessToken,
    config,
    `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros
     FROM campaign
     WHERE campaign.id = ${campaignId}`
  );
  const row = data.results?.[0];
  if (!row) return;

  console.log('\n--- Verificação ---');
  console.log('ID:', row.campaign.id);
  console.log('Nome:', row.campaign.name);
  console.log('Status:', row.campaign.status);
  if (row.campaignBudget?.amountMicros) {
    console.log('Budget (micros):', row.campaignBudget.amountMicros);
  }
}

async function main() {
  const opts = parseArgs();
  const config = loadConfig();
  if (opts.customerId) config.customerId = opts.customerId;

  console.log('='.repeat(60));
  console.log('Google Ads — Criar campanha Search');
  console.log('='.repeat(60));
  console.log('API:', config.apiVersion);
  console.log('Conta:', config.customerId);
  console.log('Campanha:', opts.name);
  console.log('Budget:', `R$ ${opts.budget}/dia`);
  console.log('URL:', opts.url);
  console.log('Status inicial: PAUSED');

  if (opts.dryRun) {
    console.log('\n(dry-run — nada enviado à API)');
    return;
  }

  const accessToken = await getAccessToken(config);

  try {
    const created = await createSearchCampaign(accessToken, config, opts);
    await verifyCampaign(accessToken, config, created.campaignResource);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Campanha criada com sucesso (PAUSADA).');
    console.log('\nAtive em ads.google.com ou mude status para ENABLED via API.');
    console.log('Resource:', created.campaignResource);
  } catch (err) {
    const authErr = err.data?.error?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError;
    console.error('\n❌ Erro:', err.message);
    if (authErr === 'DEVELOPER_TOKEN_NOT_APPROVED') {
      console.log('\nDeveloper token em Test Access — só funciona em contas de teste.');
      console.log('Solicite Basic Access: https://ads.google.com/aw/apicenter');
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
