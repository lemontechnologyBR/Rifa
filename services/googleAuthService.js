/**
 * Google OAuth 2.0 — login/cadastro de organizadores (criadores).
 */
const crypto = require('crypto');
const { getAppUrl } = require('../lib/requestUrl');

const STATE_TTL_MS = 15 * 60 * 1000;

function getStateSecret() {
  return process.env.SESSION_SECRET || 'rifas-dev-secret-change-me';
}

const GoogleAuthService = {
  isConfigured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },

  getCallbackUrl(req) {
    const base = getAppUrl(req).replace(/\/$/, '');
    const expected = `${base}/auth/google/organizador/callback`;
    const custom = process.env.GOOGLE_CALLBACK_URL?.trim();
    if (custom && /\/auth\/google\/organizador\/callback\/?$/.test(custom)) {
      return custom.replace(/\/$/, '');
    }
    return expected;
  },

  encodeState(payload) {
    const data = Buffer.from(JSON.stringify({ ...payload, ts: payload.ts || Date.now() })).toString('base64url');
    const sig = crypto.createHmac('sha256', getStateSecret()).update(data).digest('base64url');
    return `${data}.${sig}`;
  },

  verifyState(state) {
    if (!state || typeof state !== 'string') {
      throw new Error('State OAuth inválido.');
    }

    const dot = state.lastIndexOf('.');
    if (dot <= 0) {
      throw new Error('State OAuth inválido.');
    }

    const data = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = crypto.createHmac('sha256', getStateSecret()).update(data).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new Error('State OAuth inválido.');
    }

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.ts || Date.now() - payload.ts > STATE_TTL_MS) {
      throw new Error('State OAuth expirado.');
    }

    return payload;
  },

  decodeState(state) {
    return this.verifyState(state);
  },

  buildAuthUrl(req, state) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: this.getCallbackUrl(req),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async exchangeCode(req, code) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: this.getCallbackUrl(req),
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Google token error:', err);
      throw new Error('Falha ao autenticar com Google.');
    }

    const tokens = await tokenRes.json();
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    if (!profileRes.ok) throw new Error('Não foi possível obter perfil do Google.');

    const profile = await profileRes.json();
    if (!profile.email) throw new Error('Conta Google sem e-mail. Use outra conta.');

    return {
      googleId: profile.sub,
      email: profile.email.toLowerCase(),
      nome: profile.name || profile.email.split('@')[0],
      picture: profile.picture || null
    };
  }
};

module.exports = GoogleAuthService;
