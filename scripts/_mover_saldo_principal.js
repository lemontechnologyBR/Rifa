/**
 * Diagnóstico + débito total subconta Woovi → conta principal.
 * Uso: node scripts/_mover_saldo_principal.js <email> [--execute]
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const APP_ID = process.env.WOOVI_APP_ID;
const EMAIL = process.argv[2];
const EXECUTE = process.argv.includes('--execute');

function normalizarChave(chave) {
  if (!chave) return chave;
  const raw = String(chave).trim();
  if (raw.startsWith('+')) return raw;
  if (raw.includes('@') || raw.includes('-')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return raw;
}

async function wooviReq(path, options = {}) {
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

(async () => {
  if (!EMAIL) throw new Error('Informe o e-mail');
  if (!APP_ID) throw new Error('WOOVI_APP_ID ausente');

  const org = await p.organizador.findFirst({
    where: { email: EMAIL },
    include: { tenant: true }
  });
  if (!org) throw new Error(`Organizador não encontrado: ${EMAIL}`);

  const tenant = org.tenant;
  const pixNorm = normalizarChave(tenant.pixChave);
  if (!pixNorm) throw new Error('Tenant sem chave PIX');

  console.log(`\n=== ${tenant.nome} (${tenant.slug}) ===`);
  console.log(`Email: ${EMAIL}`);
  console.log(`PIX: ${tenant.pixChave} → Woovi: ${pixNorm}`);
  console.log(`MP conectado: ${tenant.mpUserId ? 'sim' : 'não'}`);

  const pixEnc = encodeURIComponent(pixNorm);
  const info = await wooviReq(`/subaccount/${pixEnc}`);
  if (!info.ok) {
    console.log('Subconta:', JSON.stringify(info.data));
    throw new Error('Subconta não encontrada na Woovi');
  }

  const sub = info.data?.subAccount || info.data;
  const balanceCents = Number(sub.balance || 0);
  const balanceReais = balanceCents / 100;
  console.log(`\nSaldo subconta: R$ ${balanceReais.toFixed(2)} (${balanceCents} centavos)`);

  if (balanceCents < 1) {
    console.log('Nada a mover — saldo zero.');
    await p.$disconnect();
    return;
  }

  if (!EXECUTE) {
    console.log('\n[DRY-RUN] Use --execute para debitar subconta → conta principal.');
    await p.$disconnect();
    return;
  }

  const debito = await wooviReq(`/subaccount/${pixEnc}/debit`, {
    method: 'POST',
    body: JSON.stringify({
      value: balanceCents,
      description: `Transferência saldo para conta principal — ${tenant.slug}`
    })
  });

  console.log(`\nDébito → HTTP ${debito.status}`);
  console.log(JSON.stringify(debito.data, null, 2));
  if (!debito.ok) process.exit(1);

  const depois = await wooviReq(`/subaccount/${pixEnc}`);
  const saldoDepois = Number(depois.data?.subAccount?.balance ?? depois.data?.balance ?? 0);
  console.log(`\nSaldo subconta após: R$ ${(saldoDepois / 100).toFixed(2)}`);
  console.log('✅ Saldo movido para conta principal Woovi.');

  await p.$disconnect();
})().catch(async (e) => {
  console.error('ERRO:', e.message);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
