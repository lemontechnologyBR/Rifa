/**
 * Valida e extrai ID de tag Google Ads (gtag) a partir de texto ou snippet.
 */
const TAG_ID_RE = /\b(AW-\d+|G-[A-Z0-9]+)\b/i;

function parseGoogleAdsTagId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const match = raw.match(TAG_ID_RE);
  if (!match) return '';

  return match[1].toUpperCase();
}

function isValidGoogleAdsTagId(id) {
  return /^(AW-\d+|G-[A-Z0-9]+)$/.test(String(id || '').trim());
}

module.exports = { parseGoogleAdsTagId, isValidGoogleAdsTagId };
