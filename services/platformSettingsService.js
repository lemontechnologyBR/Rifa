/**
 * Configurações globais da plataforma (Super Admin).
 */
const prisma = require('../lib/prisma');
const { parseGoogleAdsTagId, isValidGoogleAdsTagId } = require('../lib/googleAdsTag');

const KEYS = {
  GOOGLE_ADS_TAG_ID: 'google_ads_tag_id',
  GOOGLE_ADS_ENABLED: 'google_ads_enabled'
};

let tagCache = { value: null, at: 0 };
const CACHE_MS = 30_000;

function invalidateCache() {
  tagCache = { value: null, at: 0 };
}

async function get(key) {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function set(key, value) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) }
  });
  invalidateCache();
}

async function getMarketingSettings() {
  const [tagRaw, enabledRaw] = await Promise.all([
    get(KEYS.GOOGLE_ADS_TAG_ID),
    get(KEYS.GOOGLE_ADS_ENABLED)
  ]);

  return {
    googleAdsTagId: tagRaw || '',
    googleAdsEnabled: enabledRaw !== 'false'
  };
}

async function getActiveGoogleAdsTagId() {
  if (tagCache.value !== null && Date.now() - tagCache.at < CACHE_MS) {
    return tagCache.value;
  }

  const { googleAdsTagId, googleAdsEnabled } = await getMarketingSettings();
  const active = googleAdsEnabled && googleAdsTagId ? googleAdsTagId : '';
  tagCache = { value: active, at: Date.now() };
  return active;
}

async function saveMarketingSettings({ tagInput, enabled }) {
  const tagId = parseGoogleAdsTagId(tagInput);

  if (tagInput && !tagId) {
    throw new Error('Tag inválida. Use o ID AW-... ou G-... ou cole o snippet completo do Google Ads.');
  }

  if (tagId && !isValidGoogleAdsTagId(tagId)) {
    throw new Error('Formato de tag inválido. Exemplo: AW-18290467577');
  }

  await set(KEYS.GOOGLE_ADS_TAG_ID, tagId);
  await set(KEYS.GOOGLE_ADS_ENABLED, enabled === true || enabled === 'true' || enabled === 'on' ? 'true' : 'false');

  return { googleAdsTagId: tagId, googleAdsEnabled: enabled !== false && enabled !== 'false' && enabled !== 'off' };
}

module.exports = {
  KEYS,
  getMarketingSettings,
  getActiveGoogleAdsTagId,
  saveMarketingSettings,
  invalidateCache
};
