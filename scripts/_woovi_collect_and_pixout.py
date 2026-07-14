"""
1) Debita todas subcontas OLD → main OLD
2) PIX out do main OLD → EVP Lemon
"""
import os
import paramiko
import sys
import time
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"
NEW_EVP = "dfdb7f42-895b-4275-9f28-45cf553dcd7a"
OLD_ACCOUNT_ID = "6a1b283ae04a8ada90ec0118"

SCRIPT = r'''
const API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const OLD = process.env.WOOVI_APP_ID;
const NEW_EVP = process.env.NEW_EVP;
const OLD_ACCOUNT_ID = process.env.OLD_ACCOUNT_ID;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: OLD,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) { data = { raw: text.slice(0, 400) }; }
  if (res.status === 429) {
    const wait = Number(data.retryAfter || 60) * 1000;
    console.log('RATE_LIMIT wait', wait);
    await sleep(wait + 1000);
    return req(path, opts);
  }
  return { ok: res.ok, status: res.status, data };
}

function pickList(data) {
  if (Array.isArray(data?.subAccounts)) return data.subAccounts;
  if (data?.subAccounts?.subaccount) {
    const s = data.subAccounts.subaccount;
    return Array.isArray(s) ? s : [s];
  }
  return [];
}

async function listAll() {
  const all = [];
  let skip = 0;
  for (let i = 0; i < 50; i++) {
    const r = await req(`/subaccount?skip=${skip}&limit=100`);
    if (!r.ok) throw new Error('list ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 120));
    const page = pickList(r.data);
    all.push(...page);
    if (!(r.data.pageInfo?.hasNextPage) && page.length < 100) break;
    skip += 100;
    if (!page.length) break;
  }
  return all;
}

(async () => {
  // status before
  const beforeAcc = await req(`/account/${OLD_ACCOUNT_ID}`);
  console.log('MAIN_BEFORE', JSON.stringify(beforeAcc.data?.account?.balance));

  const list = await listAll();
  const withBal = list
    .map((s) => ({ pixKey: s.pixKey, name: s.name, cents: Math.round(Number(s.balance || 0)) }))
    .filter((s) => s.cents > 0);

  console.log('SUBS_COM_SALDO', withBal.length, 'TOTAL_REAIS', withBal.reduce((a, b) => a + b.cents, 0) / 100);
  console.log('LISTA', JSON.stringify(withBal.map((x) => ({ pixKey: x.pixKey, reais: x.cents / 100 }))));

  const debitados = [];
  const erros = [];
  for (const s of withBal) {
    await sleep(400);
    const r = await req(`/subaccount/${encodeURIComponent(s.pixKey)}/debit`, {
      method: 'POST',
      body: JSON.stringify({
        value: s.cents,
        description: `Recolha migrate Lemon ${s.pixKey}`.slice(0, 120)
      })
    });
    if (r.ok) debitados.push({ pixKey: s.pixKey, cents: s.cents });
    else erros.push({ pixKey: s.pixKey, status: r.status, data: r.data });
  }
  console.log('DEBIT', JSON.stringify({ ok: debitados.length, erros: erros.length, totalCents: debitados.reduce((a, b) => a + b.cents, 0), errosDetail: erros }));

  await sleep(2000);
  const afterDebit = await req(`/account/${OLD_ACCOUNT_ID}`);
  const available = Number(afterDebit.data?.account?.balance?.available || 0);
  console.log('MAIN_AFTER_DEBIT', JSON.stringify(afterDebit.data?.account?.balance));

  if (available < 1) {
    console.log('PAY_SKIP', 'sem saldo disponivel na main');
    return;
  }

  const correlationID = `migrate-lemon-out-${Date.now()}`;
  const pay = await req('/payment', {
    method: 'POST',
    body: JSON.stringify({
      type: 'PIX_KEY',
      value: available,
      destinationAlias: NEW_EVP,
      destinationAliasType: 'RANDOM',
      comment: 'Migracao VouRifar Lucas -> Lemon Technology',
      correlationID,
      autoApprove: true
    })
  });
  console.log('PAY', JSON.stringify({ ok: pay.ok, status: pay.status, correlationID, available, data: pay.data }).slice(0, 2500));

  // poll payment status a bit
  if (pay.ok) {
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const st = await req(`/payment/${encodeURIComponent(correlationID)}`);
      const status = st.data?.payment?.status || st.data?.status;
      console.log('PAY_STATUS', i, status || JSON.stringify(st.data).slice(0, 200));
      if (['CONFIRMED', 'COMPLETED', 'APPROVED'].includes(String(status || '').toUpperCase())) break;
      if (['FAILED', 'REJECTED', 'CANCELLED', 'REMOVED'].includes(String(status || '').toUpperCase())) break;
    }
  }

  const finalAcc = await req(`/account/${OLD_ACCOUNT_ID}`);
  console.log('MAIN_FINAL', JSON.stringify(finalAcc.data?.account?.balance));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
'''

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

escaped = SCRIPT.replace("'", "'\\''")
cmd = (
    f"docker exec -e NEW_EVP='{NEW_EVP}' -e OLD_ACCOUNT_ID='{OLD_ACCOUNT_ID}' "
    f"-w /app {CONTAINER} node -e '{escaped}'"
)
print("Recolhendo subcontas e tentando PIX out...")
_, o, e = c.exec_command(cmd, timeout=600)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err:
    print("[stderr]", err[:800])
c.close()
