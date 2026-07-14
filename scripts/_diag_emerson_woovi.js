require('dotenv').config();
const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const APP_ID = process.env.WOOVI_APP_ID;
const PIX = 'emersoncaminhando@gmail.com';
const CORRELATIONS = [
  'PIX-1783362591165-1CC095',
  'PIX-1783034089886-2A7789'
];

async function req(path) {
  const res = await fetch(`${WOOVI_API}${path}`, {
    headers: { Authorization: APP_ID, Accept: 'application/json' }
  });
  const raw = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(raw) }; }
  catch { return { ok: res.ok, status: res.status, data: raw }; }
}

(async () => {
  console.log('=== Cobranças confirmadas ===');
  for (const id of CORRELATIONS) {
    const r = await req(`/charge/${encodeURIComponent(id)}`);
    console.log(`\n${id} → HTTP ${r.status}`);
    const ch = r.data?.charge || r.data;
    if (ch) {
      console.log(JSON.stringify({
        status: ch.status,
        value: ch.value,
        paidAt: ch.paidAt,
        splits: ch.splits
      }, null, 2));
    } else {
      console.log(JSON.stringify(r.data, null, 2));
    }
  }

  console.log('\n=== Subconta ===');
  const sub = await req(`/subaccount/${encodeURIComponent(PIX)}`);
  console.log(JSON.stringify(sub.data, null, 2));

  console.log('\n=== Extrato subconta ===');
  const ext = await req(`/subaccount/${encodeURIComponent(PIX)}/statement?limit=20`);
  const entries = Array.isArray(ext.data) ? ext.data : ext.data?.entries || ext.data?.statement || [];
  if (!entries.length) console.log('(vazio)', JSON.stringify(ext.data).slice(0, 500));
  entries.forEach((e) => {
    console.log(`${e.time || e.createdAt || '?'} | ${e.type || e.operationType} | R$ ${(Math.abs(Number(e.value||0))/100).toFixed(2)} | ${e.description || ''}`);
  });
})().catch((e) => { console.error(e.message); process.exit(1); });
