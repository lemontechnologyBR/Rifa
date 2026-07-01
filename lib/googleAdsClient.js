/**
 * Cliente mínimo para Google Ads API (REST v22).
 */
require('dotenv').config();

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v22';
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;

function loadConfig() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = String(process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/\D/g, '');
  const loginCustomerId = String(
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId
  ).replace(/\D/g, '');
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error('Defina GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET no .env');
  }
  if (!developerToken) throw new Error('Defina GOOGLE_ADS_DEVELOPER_TOKEN no .env');
  if (!refreshToken) throw new Error('Defina GOOGLE_ADS_REFRESH_TOKEN no .env');
  if (!customerId) throw new Error('Defina GOOGLE_ADS_CUSTOMER_ID no .env');

  return {
    clientId,
    clientSecret,
    developerToken,
    customerId,
    loginCustomerId,
    refreshToken,
    apiVersion: API_VERSION
  };
}

async function getAccessToken(config) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `OAuth HTTP ${res.status}`);
  }
  return data.access_token;
}

function adsHeaders(accessToken, config) {
  const h = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': config.developerToken,
    'Content-Type': 'application/json'
  };
  if (config.loginCustomerId) h['login-customer-id'] = config.loginCustomerId;
  return h;
}

function formatAdsError(data) {
  const err = data?.error;
  if (!err) return JSON.stringify(data, null, 2);

  const lines = [`${err.status || err.code}: ${err.message}`];
  const details = err.details?.[0]?.errors || [];
  for (const e of details) {
    const code = e.errorCode ? JSON.stringify(e.errorCode) : '';
    lines.push(`  - ${e.message}${code ? ` (${code})` : ''}`);
  }
  return lines.join('\n');
}

async function adsRequest(accessToken, config, method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: adsHeaders(accessToken, config),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(formatAdsError(data));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function mutate(accessToken, config, resource, operations) {
  const { customerId } = config;
  return adsRequest(
    accessToken,
    config,
    'POST',
    `/customers/${customerId}/${resource}:mutate`,
    { operations }
  );
}

async function search(accessToken, config, query) {
  const { customerId } = config;
  return adsRequest(
    accessToken,
    config,
    'POST',
    `/customers/${customerId}/googleAds:search`,
    { query }
  );
}

async function generateKeywordIdeas(accessToken, config, request) {
  const { customerId } = config;
  return adsRequest(
    accessToken,
    config,
    'POST',
    `/customers/${customerId}:generateKeywordIdeas`,
    request
  );
}

module.exports = {
  loadConfig,
  getAccessToken,
  mutate,
  search,
  generateKeywordIdeas,
  formatAdsError
};
