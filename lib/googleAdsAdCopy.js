/**
 * Textos de anúncio RSA do VouRifar (limites Google Ads).
 */
const fs = require('fs');
const path = require('path');

const COPY_FILE = path.join(__dirname, '..', 'docs', 'google-ads-ad-copy.txt');

const HEADLINE_MAX = 30;
const DESCRIPTION_MAX = 90;

function parseAdCopyFile() {
  const raw = fs.readFileSync(COPY_FILE, 'utf8');
  const headlines = [];
  const descriptions = [];
  let section = 'headlines';

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      if (t.startsWith('# Descri')) section = 'descriptions';
      continue;
    }
    if (t === '---') {
      section = 'descriptions';
      continue;
    }
    if (section === 'headlines') headlines.push(t);
    else descriptions.push(t);
  }

  return { headlines, descriptions };
}

function assertLimits(headlines, descriptions) {
  for (const h of headlines) {
    if (h.length > HEADLINE_MAX) {
      throw new Error(`Título excede ${HEADLINE_MAX} chars (${h.length}): "${h}"`);
    }
  }
  for (const d of descriptions) {
    if (d.length > DESCRIPTION_MAX) {
      throw new Error(`Descrição excede ${DESCRIPTION_MAX} chars (${d.length}): "${d}"`);
    }
  }
}

function loadVouRifarAdCopy() {
  const copy = parseAdCopyFile();
  assertLimits(copy.headlines, copy.descriptions);
  return copy;
}

module.exports = {
  COPY_FILE,
  HEADLINE_MAX,
  DESCRIPTION_MAX,
  loadVouRifarAdCopy
};
