require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const APP = process.env.WOOVI_APP_ID;

(async () => {
  for (const pix of ['itau@darktech.cloud', 'emersoncaminhando@gmail.com']) {
    const r = await fetch(`${API}/subaccount/${encodeURIComponent(pix)}`, {
      headers: { Authorization: APP, Accept: 'application/json' }
    });
    const d = await r.json();
    console.log(`${pix} → R$ ${((d.subAccount?.balance || 0) / 100).toFixed(2)}`);
  }

  const p = new PrismaClient();
  const tenants = await p.tenant.findMany({
    where: {
      OR: [
        { pixChave: { contains: 'darktech' } },
        { pixChave: 'emersoncaminhando@gmail.com' },
        { slug: 'sorte-da-vida' }
      ]
    },
    select: { id: true, slug: true, nome: true, pixChave: true }
  });
  console.log('\nTenants:', JSON.stringify(tenants, null, 2));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
