/**
 * Sitelinks do VouRifar para Google Ads.
 */
const fs = require('fs');
const path = require('path');

const SITELINKS_FILE = path.join(__dirname, '..', 'docs', 'google-ads-sitelinks.txt');

const TEXT_MAX = 25;
const DESC_MAX = 35;

function loadVouRifarSitelinks() {
  const raw = fs.readFileSync(SITELINKS_FILE, 'utf8');
  const sitelinks = [];
  let current = null;

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;

    if (t === '---') {
      if (current?.text && current?.url) sitelinks.push(current);
      current = { text: '', desc1: '', desc2: '', url: '' };
      continue;
    }

    if (!current) current = { text: '', desc1: '', desc2: '', url: '' };

    const m = t.match(/^(text|desc1|desc2|url):\s*(.+)$/i);
    if (m) current[m[1].toLowerCase()] = m[2].trim();
  }

  if (current?.text && current?.url) sitelinks.push(current);

  for (const s of sitelinks) {
    if (s.text.length > TEXT_MAX) {
      throw new Error(`Sitelink "${s.text}" excede ${TEXT_MAX} chars (${s.text.length})`);
    }
    if (s.desc1.length > DESC_MAX) {
      throw new Error(`Descrição 1 de "${s.text}" excede ${DESC_MAX} chars`);
    }
    if (s.desc2.length > DESC_MAX) {
      throw new Error(`Descrição 2 de "${s.text}" excede ${DESC_MAX} chars`);
    }
  }

  return sitelinks;
}

module.exports = {
  SITELINKS_FILE,
  TEXT_MAX,
  DESC_MAX,
  loadVouRifarSitelinks
};
