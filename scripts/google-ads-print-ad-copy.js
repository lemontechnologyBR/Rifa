#!/usr/bin/env node
const { loadVouRifarAdCopy, HEADLINE_MAX, DESCRIPTION_MAX } = require('../lib/googleAdsAdCopy');

const copy = loadVouRifarAdCopy();

console.log('='.repeat(60));
console.log('TÍTULOS (cole um por campo — mín. 3, máx. 15)');
console.log('='.repeat(60));
copy.headlines.forEach((h, i) => {
  console.log(`${String(i + 1).padStart(2)}. [${h.length}/${HEADLINE_MAX}] ${h}`);
});

console.log('\n' + '='.repeat(60));
console.log('DESCRIÇÕES (cole uma por campo — mín. 2, máx. 4)');
console.log('='.repeat(60));
copy.descriptions.forEach((d, i) => {
  console.log(`${String(i + 1).padStart(2)}. [${d.length}/${DESCRIPTION_MAX}] ${d}`);
});

console.log('\n--- Copiar títulos (bloco) ---\n');
console.log(copy.headlines.join('\n'));

console.log('\n--- Copiar descrições (bloco) ---\n');
console.log(copy.descriptions.join('\n'));
