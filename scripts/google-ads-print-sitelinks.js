#!/usr/bin/env node
const { loadVouRifarSitelinks, TEXT_MAX, DESC_MAX } = require('../lib/googleAdsSitelinks');

const links = loadVouRifarSitelinks();

links.forEach((s, i) => {
  console.log('='.repeat(60));
  console.log(`SITELINK ${i + 1}: ${s.text}`);
  console.log('='.repeat(60));
  console.log(`Texto do sitelink     [${s.text.length}/${TEXT_MAX}]  ${s.text}`);
  console.log(`Linha de descrição 1  [${s.desc1.length}/${DESC_MAX}]  ${s.desc1}`);
  console.log(`Linha de descrição 2  [${s.desc2.length}/${DESC_MAX}]  ${s.desc2}`);
  console.log(`URL final             ${s.url}`);
  console.log('');
});
