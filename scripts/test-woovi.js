/**
 * Teste manual da API Woovi — node scripts/test-woovi.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
const appId = String(process.env.WOOVI_APP_ID || '').trim();

async function api(path, options = {}) {
  const res = await fetch(`${WOOVI_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: appId,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('=== Teste Woovi API ===');
  console.log('Base:', WOOVI_API);
  console.log('Docs: https://developers.woovi.com/api');
  console.log('App ID:', appId ? `ok (${appId.length} chars)` : 'AUSENTE');

  if (!appId) process.exit(1);

  const list = await api('/charge?limit=1');
  console.log('\n[1] Autenticacao GET /charge:', list.status === 200 ? 'OK' : 'FALHOU');
  if (list.status !== 200) {
    console.log(JSON.stringify(list.data));
    process.exit(1);
  }

  const correlationID = `vourifar-test-${Date.now()}`;
  const valorCota = 1000; // R$ 10,00
  const valorComTaxa = 1050; // R$ 10,50 (+5%)
  console.log('\n[2] Cobranca com split (simula compra de cota R$10):');
  const charge = await api('/charge', {
    method: 'POST',
    body: JSON.stringify({
      correlationID,
      value: valorComTaxa,
      comment: 'Teste VouRifar split',
      splits: [{
        pixKey: 'teste-vourifar@email.com',
        value: valorCota,
        splitType: 'SPLIT_SUB_ACCOUNT'
      }]
    })
  });

  if (charge.ok) {
    const c = charge.data.charge || charge.data;
    console.log('    OK — status:', c.status, '| fee Woovi:', c.fee, 'centavos');
    console.log('    brCode gerado:', !!(c.brCode || c.pixCopiaECola));
  } else {
    console.log('    ERRO:', JSON.stringify(charge.data));
    process.exit(1);
  }

  console.log('\n[3] Subconta (precisa chave PIX real cadastrada no BACEN):');
  console.log('    Pule no teste — salve sua chave em Admin > Carteira para registrar.');

  console.log('\n=== Integracao OK ===');
  console.log('Webhook cadastre em: ' + (process.env.APP_URL || 'APP_URL') + '/webhooks/woovi');
}

main().catch((e) => {
  console.error('Falha:', e.message);
  process.exit(1);
});
