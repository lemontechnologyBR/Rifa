const c = require('../lib/config');
console.log('TAXA_APPLICATION_FEE:', c.TAXA_APPLICATION_FEE, '=', (c.TAXA_APPLICATION_FEE*100) + '%');
[5, 10, 25, 50].forEach(v => {
  const fee = Math.round(v * c.TAXA_APPLICATION_FEE * 100) / 100;
  const mpFee = Math.round(v * 0.01 * 100) / 100;
  const organizer = Math.round((v - fee - mpFee) * 100) / 100;
  console.log(`R$ ${v}: app_fee=${fee} | mp=${mpFee} | organizer=${organizer} (${(organizer/v*100).toFixed(1)}%)`);
});
