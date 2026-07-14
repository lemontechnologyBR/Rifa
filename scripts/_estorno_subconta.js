/**
 * Estorno de taxa de saque indevida na subconta Woovi.
 * Uso: node scripts/_estorno_subconta.js <pixChave> <valorReais> [descricao]
 */
require('dotenv').config();
const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const APP_ID = process.env.WOOVI_APP_ID;

function normalizarChave(chave) {
  if (!chave) return chave;
  const raw = String(chave).trim();
  if (raw.startsWith('+')) return raw;
  if (raw.includes('@') || raw.includes('-')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return raw;
}

const PIX = normalizarChave(process.argv[2] || '19989067050');
const VALOR = Number(process.argv[3] || 11);
const DESC = process.argv[4] || 'Estorno taxa de saque indevida VouRifar';

(async () => {
  if (!APP_ID) throw new Error('WOOVI_APP_ID ausente');

  const valueCents = Math.round(VALOR * 100);
  const pixEnc = encodeURIComponent(PIX);

  async function req(path, options = {}) {
    const res = await fetch(`${WOOVI_API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: APP_ID,
        ...(options.headers || {})
      }
    });
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }
    return { ok: res.ok, status: res.status, data };
  }

  console.log(`\n=== Estorno subconta Woovi ===`);
  console.log(`Chave: ${PIX}`);
  console.log(`Valor: R$ ${VALOR.toFixed(2)} (${valueCents} centavos)`);

  const antes = await req(`/subaccount/${pixEnc}`);
  const saldoAntes = antes.data?.subAccount?.balance ?? antes.data?.balance;
  console.log(`Saldo antes: ${saldoAntes != null ? `R$ ${(saldoAntes / 100).toFixed(2)}` : JSON.stringify(antes.data)}`);

  const credito = await req(`/subaccount/${pixEnc}/credit`, {
    method: 'POST',
    body: JSON.stringify({
      value: valueCents,
      description: DESC.slice(0, 120)
    })
  });

  console.log(`\nCrédito → HTTP ${credito.status}`);
  console.log(JSON.stringify(credito.data, null, 2));

  if (!credito.ok) {
    process.exit(1);
  }

  const depois = await req(`/subaccount/${pixEnc}`);
  const saldoDepois = depois.data?.subAccount?.balance ?? depois.data?.balance;
  console.log(`\nSaldo depois: ${saldoDepois != null ? `R$ ${(saldoDepois / 100).toFixed(2)}` : JSON.stringify(depois.data)}`);
  console.log('\n✅ Estorno concluído.');
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
