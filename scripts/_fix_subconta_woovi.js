require('dotenv').config();
const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const APP_ID = process.env.WOOVI_APP_ID;

const PIX_CHAVE = process.argv[2] || '19989067050';
const TENANT_NOME = process.argv[3] || 'Ajude a Cafe';

async function req(path, options = {}) {
  const res = await fetch(`${WOOVI_API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: APP_ID, ...(options.headers||{}) }
  });
  const raw = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(raw) }; }
  catch { return { ok: res.ok, status: res.status, data: raw }; }
}

// Variações da chave a tentar
function variacoes(chave) {
  const digits = chave.replace(/\D/g, '');
  const v = [chave];
  if (!chave.startsWith('+55') && digits.length === 11) v.push('+55' + digits);
  if (!chave.startsWith('+55') && digits.length === 10) v.push('+55' + digits);
  v.push(encodeURIComponent('+55' + digits));
  return [...new Set(v)];
}

(async () => {
  console.log(`\n=== Subconta Woovi: ${PIX_CHAVE} ===\n`);

  // 1. Testar todas as variações da chave
  for (const chave of variacoes(PIX_CHAVE)) {
    const r = await req(`/subaccount/${encodeURIComponent(chave)}`);
    if (r.ok) {
      console.log(`✅ Subconta encontrada com chave: ${chave}`);
      console.log(JSON.stringify(r.data, null, 2));
    } else {
      console.log(`❌ [${r.status}] Chave ${chave}: ${JSON.stringify(r.data)}`);
    }
  }

  // 2. Listar subcontas e encontrar a que corresponde ao tenant
  console.log('\n--- Listando primeiras 50 subcontas ---');
  let page = 0;
  let found = null;
  while (page < 4) {
    const lista = await req(`/subaccount?limit=50&skip=${page*50}`);
    const arr = lista.data?.subAccounts || lista.data?.data || [];
    const match = arr.find(s => {
      const k = String(s.pixKey || s.pixAlias || '').replace(/\D/g,'');
      return k === PIX_CHAVE.replace(/\D/g,'');
    });
    if (match) { found = match; break; }
    if (arr.length < 50) break;
    page++;
  }

  if (found) {
    console.log('\n✅ Subconta encontrada por CPF/número:', JSON.stringify(found, null, 2));
    // 3. Consultar saldo com a chave normalizada
    const chaveWoovi = found.pixKey || found.pixAlias;
    const saldo = await req(`/subaccount/${encodeURIComponent(chaveWoovi)}`);
    console.log('\nSaldo:', JSON.stringify(saldo.data, null, 2));
  } else {
    console.log('\n❌ Subconta não encontrada em nenhuma página.');
    console.log('Criando subconta...');
    const criar = await req('/subaccount', {
      method: 'POST',
      body: JSON.stringify({ name: TENANT_NOME.slice(0,64), pixKey: PIX_CHAVE })
    });
    console.log('Criação:', JSON.stringify(criar.data, null, 2));
    const chaveWoovi = criar.data?.subAccount?.pixKey || PIX_CHAVE;
    const saldo = await req(`/subaccount/${encodeURIComponent(chaveWoovi)}`);
    console.log('\nSaldo após criação:', JSON.stringify(saldo.data, null, 2));
  }
})().catch(e => { console.error(e.message); process.exit(1); });
