#!/usr/bin/env node
/**
 * Gera Refresh Token OAuth para Google Ads API e testa a conexão.
 *
 * Pré-requisitos:
 * 1. Google Ads API ativada no Google Cloud Console
 * 2. Redirect URI no OAuth client: http://localhost:8765/callback
 * 3. .env com GOOGLE_ADS_DEVELOPER_TOKEN, CLIENT_ID, CLIENT_SECRET, CUSTOMER_ID
 *
 * Uso:
 *   node scripts/google-ads-auth.js          # abre browser → gera refresh token
 *   node scripts/google-ads-auth.js --test   # só testa (precisa GOOGLE_ADS_REFRESH_TOKEN)
 */
require('dotenv').config();

const http = require('http');
const { exec } = require('child_process');

const PORT = parseInt(process.env.GOOGLE_ADS_AUTH_PORT || '8765', 10);
const REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI || `http://localhost:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v22';

function cfg() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = String(process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
  const loginCustomerId = String(
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId
  ).replace(/\D/g, '');
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  return { clientId, clientSecret, developerToken, customerId, loginCustomerId, refreshToken };
}

function die(msg) {
  console.error('\n❌', msg);
  process.exit(1);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function exchangeCode(code, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  return data.access_token;
}

function adsHeaders(accessToken, developerToken, loginCustomerId) {
  const h = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json'
  };
  if (loginCustomerId) h['login-customer-id'] = loginCustomerId;
  return h;
}

async function testConnection(accessToken, { developerToken, customerId, loginCustomerId }) {
  console.log('\n--- Teste 1: contas acessíveis ---');
  const listRes = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
    { headers: adsHeaders(accessToken, developerToken, loginCustomerId) }
  );
  const listText = await listRes.text();
  let listData;
  try { listData = JSON.parse(listText); } catch { listData = listText; }

  if (!listRes.ok) {
    console.error('Falhou:', listRes.status, typeof listData === 'object' ? JSON.stringify(listData, null, 2) : listData);
    return false;
  }

  const ids = listData.resourceNames || [];
  console.log('Contas:', ids.length ? ids.join(', ') : '(nenhuma)');

  if (!customerId) {
    console.log('\n⚠️  GOOGLE_ADS_CUSTOMER_ID não definido — pulando consulta da conta.');
    return true;
  }

  console.log('\n--- Teste 2: dados da conta', customerId, '---');
  const searchRes = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
    {
      method: 'POST',
      headers: adsHeaders(accessToken, developerToken, loginCustomerId),
      body: JSON.stringify({
        query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1'
      })
    }
  );
  const searchText = await searchRes.text();
  let searchData;
  try { searchData = JSON.parse(searchText); } catch { searchData = searchText; }

  if (!searchRes.ok) {
    console.error('Falhou:', searchRes.status, typeof searchData === 'object' ? JSON.stringify(searchData, null, 2) : searchData);
    const authErr = searchData?.error?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError;
    if (authErr === 'DEVELOPER_TOKEN_NOT_APPROVED') {
      console.log('\n⚠️  Developer token em modo Test Access — só funciona com contas de teste.');
      console.log('   Para usar a conta real, solicite Basic Access em:');
      console.log('   https://ads.google.com/aw/apicenter');
      console.log('\n   OAuth e listagem de contas OK — integração pode ser desenvolvida com conta de teste.');
      return 'partial';
    }
    console.log('\nDica: se o erro mencionar login-customer-id, confira GOOGLE_ADS_LOGIN_CUSTOMER_ID (ID da MCC).');
    return false;
  }

  const row = searchData.results?.[0]?.customer;
  if (row) {
    console.log('OK — Conta:', row.descriptiveName, '| ID:', row.id, '| Moeda:', row.currencyCode);
  } else {
    console.log('Resposta OK (sem linhas):', JSON.stringify(searchData).slice(0, 300));
  }
  return true;
}

function buildAuthUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function waitForCallback(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const err = url.searchParams.get('error');
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Erro OAuth</h1><p>${err}</p><p>Feche esta aba.</p>`);
        server.close();
        reject(new Error(err));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Código ausente</h1>');
        return;
      }

      try {
        const tokens = await exchangeCode(code, clientId, clientSecret);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html><body style="font-family:sans-serif;padding:40px;text-align:center">
            <h1 style="color:#059669">Autorizado!</h1>
            <p>Pode fechar esta aba e voltar ao terminal.</p>
          </body></html>
        `);
        server.close();
        resolve(tokens);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Erro</h1><pre>${e.message}</pre>`);
        server.close();
        reject(e);
      }
    });

    server.listen(PORT, () => {
      console.log(`Servidor OAuth em http://localhost:${PORT}/callback`);
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        reject(new Error(`Porta ${PORT} em uso. Defina GOOGLE_ADS_AUTH_PORT no .env.`));
      } else {
        reject(e);
      }
    });
  });
}

async function main() {
  const testOnly = process.argv.includes('--test');
  const c = cfg();

  if (!c.clientId || !c.clientSecret) {
    die('Defina GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET (ou GOOGLE_CLIENT_ID/SECRET) no .env');
  }
  if (!c.developerToken) {
    die('Defina GOOGLE_ADS_DEVELOPER_TOKEN no .env');
  }

  console.log('='.repeat(60));
  console.log('Google Ads API — Autenticação OAuth');
  console.log('='.repeat(60));
  console.log('API version:', API_VERSION);
  console.log('Redirect URI:', REDIRECT_URI);
  console.log('Customer ID:', c.customerId || '(não definido)');
  console.log('Login Customer ID:', c.loginCustomerId || '(não definido)');

  let refreshToken = c.refreshToken;

  if (!testOnly && !refreshToken) {
    console.log('\n⚠️  Antes de continuar, adicione no Google Cloud Console → Credenciais → OAuth:');
    console.log('   Redirect URI:', REDIRECT_URI);
    console.log('\nAbrindo navegador para autorizar...\n');

    const authUrl = buildAuthUrl(c.clientId);
    console.log('Se não abrir, cole no navegador:\n', authUrl, '\n');

    openBrowser(authUrl);

    const tokens = await waitForCallback(c.clientId, c.clientSecret);
    refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      die('Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e rode de novo.');
    }

    console.log('\n✅ Refresh Token obtido!\n');
    console.log('Adicione ao .env:\n');
    console.log(`GOOGLE_ADS_REFRESH_TOKEN=${refreshToken}`);
    console.log('');
  } else if (!refreshToken) {
    die('Defina GOOGLE_ADS_REFRESH_TOKEN no .env ou rode sem --test para gerar.');
  } else {
    console.log('\nModo teste — usando GOOGLE_ADS_REFRESH_TOKEN existente.\n');
  }

  console.log('Obtendo access token...');
  const accessToken = await refreshAccessToken(refreshToken, c.clientId, c.clientSecret);

  const ok = await testConnection(accessToken, c);
  console.log('\n' + '='.repeat(60));
  if (ok === true) {
    console.log('✅ Conexão com Google Ads API OK!');
    console.log('\nPróximo passo: use GOOGLE_ADS_REFRESH_TOKEN na integração de campanhas.');
  } else if (ok === 'partial') {
    console.log('✅ OAuth e API conectados (modo Test Access).');
    console.log('\nPróximo passo: solicitar Basic Access para campanhas na conta real.');
  } else {
    console.log('❌ Teste falhou — veja erros acima.');
    process.exit(1);
  }
}

main().catch((e) => die(e.message));
