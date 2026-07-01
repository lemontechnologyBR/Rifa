/**
 * Palavras-chave VouRifar para campanhas Search (Brasil).
 */
const fs = require('fs');
const path = require('path');
const { filterSafeKeywords } = require('./googleAdsKeywordPolicy');

const KEYWORDS_FILE = path.join(__dirname, '..', 'docs', 'google-ads-keywords-vourifar.txt');

function loadVouRifarKeywords() {
  const raw = fs.readFileSync(KEYWORDS_FILE, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  return filterSafeKeywords(lines);
}

function formatForPaste(keywords, separator = '\n') {
  return keywords.join(separator);
}

module.exports = {
  KEYWORDS_FILE,
  loadVouRifarKeywords,
  formatForPaste
};
