require('dotenv').config();
const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const APP = process.env.WOOVI_APP_ID;

(async () => {
  const body = {
    value: 6510,
    fromPixKey: 'itau@darktech.cloud',
    fromPixKeyType: 'EMAIL',
    toPixKey: 'emersoncaminhando@gmail.com',
    toPixKeyType: 'EMAIL',
    correlationID: `consolidate-emerson-63-${Date.now()}`,
    description: 'Consolidação saldo sorte-da-vida'
  };

  const res = await fetch(`${WOOVI_API}/subaccount/transfer`, {
    method: 'POST',
    headers: { Authorization: APP, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('Transfer → HTTP', res.status);
  console.log(JSON.stringify(data, null, 2));

  for (const pix of ['itau@darktech.cloud', 'emersoncaminhando@gmail.com']) {
    const r = await fetch(`${WOOVI_API}/subaccount/${encodeURIComponent(pix)}`, {
      headers: { Authorization: APP, Accept: 'application/json' }
    });
    const d = await r.json();
    console.log(`${pix} → R$ ${((d.subAccount?.balance || 0) / 100).toFixed(2)}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
