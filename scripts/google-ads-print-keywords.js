#!/usr/bin/env node
/**
 * Exibe palavras-chave do VouRifar para colar no Google Ads.
 *
 * Uso:
 *   npm run google-ads:keywords          # uma por linha (padrão UI)
 *   npm run google-ads:keywords -- --csv # separadas por vírgula
 */
const { loadVouRifarKeywords, formatForPaste } = require('../lib/googleAdsKeywords');

const csv = process.argv.includes('--csv');
const keywords = loadVouRifarKeywords();

console.log(`# ${keywords.length} palavras-chave — VouRifar (Brasil)\n`);
console.log(formatForPaste(keywords, csv ? ', ' : '\n'));
