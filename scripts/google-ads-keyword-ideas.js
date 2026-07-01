#!/usr/bin/env node
/**
 * Busca ideias de palavras-chave via KeywordPlanIdeaService (Keyword Planner API).
 *
 * Uso:
 *   npm run google-ads:keyword-ideas
 *   node scripts/google-ads-keyword-ideas.js --keywords "rifa online,sistema de rifas"
 *   node scripts/google-ads-keyword-ideas.js --url https://vourifar.com.br --limit 30
 */
const {
  loadConfig,
  getAccessToken,
  generateKeywordIdeas
} = require('../lib/googleAdsClient');

const GEO_BRAZIL = 'geoTargetConstants/2076';
const LANG_PORTUGUESE = 'languageConstants/1014';

const COMPETITION_PT = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  UNSPECIFIED: '—',
  UNKNOWN: '—'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    keywords: ['rifa online'],
    url: null,
    limit: 25,
    customerId: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keywords' && args[i + 1]) {
      opts.keywords = args[++i].split(',').map((k) => k.trim()).filter(Boolean);
    } else if (args[i] === '--url' && args[i + 1]) {
      opts.url = args[++i].replace(/\/$/, '');
    } else if (args[i] === '--limit' && args[i + 1]) {
      opts.limit = parseInt(args[++i], 10) || 25;
    } else if (args[i] === '--customer-id' && args[i + 1]) {
      opts.customerId = args[++i].replace(/\D/g, '');
    }
  }

  if (!opts.keywords.length && !opts.url) {
    throw new Error('Informe --keywords ou --url');
  }

  return opts;
}

function microsToBrl(micros) {
  if (micros == null || micros === '') return '—';
  const n = Number(micros) / 1_000_000;
  return `R$ ${n.toFixed(2)}`;
}

function formatMonthlySearches(metrics) {
  if (!metrics) return '—';
  if (metrics.avgMonthlySearches != null) return String(metrics.avgMonthlySearches);
  const monthly = metrics.monthlySearchVolumes;
  if (Array.isArray(monthly) && monthly.length) {
    const last = monthly[monthly.length - 1];
    return String(last.monthlySearches ?? '—');
  }
  return '—';
}

function buildRequest(opts) {
  const request = {
    language: LANG_PORTUGUESE,
    geoTargetConstants: [GEO_BRAZIL],
    includeAdultKeywords: false,
    keywordPlanNetwork: 'GOOGLE_SEARCH'
  };

  if (opts.keywords.length && opts.url) {
    request.keywordAndUrlSeed = { keywords: opts.keywords, url: opts.url };
  } else if (opts.url) {
    request.urlSeed = { url: opts.url };
  } else {
    request.keywordSeed = { keywords: opts.keywords };
  }

  return request;
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    const volA = Number(a.keywordIdeaMetrics?.avgMonthlySearches || 0);
    const volB = Number(b.keywordIdeaMetrics?.avgMonthlySearches || 0);
    return volB - volA;
  });
}

function printTable(rows, limit) {
  const header = [
    'Palavra-chave'.padEnd(36),
    'Buscas/mês'.padStart(12),
    'Competição'.padStart(12),
    'CPC min'.padStart(10),
    'CPC max'.padStart(10)
  ].join('  ');

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const row of rows.slice(0, limit)) {
    const m = row.keywordIdeaMetrics || {};
    const comp = COMPETITION_PT[m.competition] || m.competition || '—';
    const line = [
      (row.text || '').slice(0, 36).padEnd(36),
      formatMonthlySearches(m).padStart(12),
      comp.padStart(12),
      microsToBrl(m.lowTopOfPageBidMicros).padStart(10),
      microsToBrl(m.highTopOfPageBidMicros).padStart(10)
    ].join('  ');
    console.log(line);
  }
}

async function main() {
  const opts = parseArgs();
  const config = loadConfig();
  if (opts.customerId) config.customerId = opts.customerId;

  console.log('='.repeat(72));
  console.log('Google Ads — Ideias de palavras-chave (Brasil, Português)');
  console.log('='.repeat(72));
  console.log('API:', config.apiVersion);
  console.log('Conta:', config.customerId);
  if (opts.keywords.length) console.log('Seeds:', opts.keywords.join(', '));
  if (opts.url) console.log('URL:', opts.url);
  console.log('Limite:', opts.limit);

  const accessToken = await getAccessToken(config);
  const request = buildRequest(opts);

  try {
    const data = await generateKeywordIdeas(accessToken, config, request);
    const results = sortResults(data.results || []);

    if (!results.length) {
      console.log('\nNenhuma ideia retornada.');
      return;
    }

    console.log(`\n${results.length} ideias encontradas (exibindo ${Math.min(opts.limit, results.length)}):\n`);
    printTable(results, opts.limit);

    console.log('\n' + '='.repeat(72));
    console.log('✅ Use as melhores palavras em: npm run google-ads:create-campaign');
  } catch (err) {
    const authErr = err.data?.error?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError;
    console.error('\n❌ Erro:', err.message);
    if (authErr === 'DEVELOPER_TOKEN_NOT_APPROVED') {
      console.log('\nDeveloper token em Test Access — precisa de Basic Access ou conta de teste.');
      console.log('https://ads.google.com/aw/apicenter');
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
