/**
 * OAuth Mercado Pago — marketplace split (conta do organizador + application_fee).
 */
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { getAppUrl } = require('../lib/requestUrl');

const MP_API = process.env.MERCADOPAGO_API_BASE || 'https://api.mercadopago.com';
const STATE_TTL_MS = 15 * 60 * 1000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function getStateSecret() {
  return process.env.SESSION_SECRET || 'rifas-dev-secret-change-me';
}

function parseOAuthError(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return data?.message || data?.error_description || data?.error || raw;
  } catch (_) {
    return typeof raw === 'string' ? raw : 'Erro OAuth Mercado Pago.';
  }
}

const MercadoPagoOAuthService = {
  getClientId() {
    return String(process.env.MERCADOPAGO_CLIENT_ID || '').trim();
  },

  getClientSecret() {
    return String(process.env.MERCADOPAGO_CLIENT_SECRET || '').trim();
  },

  isSplitConfigured() {
    return !!(this.getClientId() && this.getClientSecret());
  },

  getCallbackUrl(req) {
    const base = getAppUrl(req).replace(/\/$/, '');
    const custom = process.env.MERCADOPAGO_CALLBACK_URL?.trim();
    if (custom && /\/auth\/mercadopago\/callback\/?$/.test(custom)) {
      return custom.replace(/\/$/, '');
    }
    return `${base}/auth/mercadopago/callback`;
  },

  encodeState(payload) {
    const data = Buffer.from(JSON.stringify({ ...payload, ts: payload.ts || Date.now() })).toString('base64url');
    const sig = crypto.createHmac('sha256', getStateSecret()).update(data).digest('base64url');
    return `${data}.${sig}`;
  },

  verifyState(state) {
    if (!state || typeof state !== 'string') throw new Error('State OAuth inválido.');
    const dot = state.lastIndexOf('.');
    if (dot <= 0) throw new Error('State OAuth inválido.');

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
      throw new Error('Autorização expirada. Tente conectar novamente.');
    }
    if (!payload.tenantId || !payload.tenantSlug) {
      throw new Error('State OAuth incompleto.');
    }
    return payload;
  },

  buildAuthUrl(req, state) {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: this.getCallbackUrl(req),
      state
    });
    return `https://auth.mercadopago.com.br/authorization?${params.toString()}`;
  },

  async _tokenRequest(bodyParams) {
    const body = new URLSearchParams(bodyParams);
    const res = await fetch(`${MP_API}/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error('[MP OAuth] token error:', raw.slice(0, 400));
      throw new Error(parseOAuthError(raw));
    }
    return JSON.parse(raw);
  },

  async exchangeCode(req, code) {
    return this._tokenRequest({
      client_id: this.getClientId(),
      client_secret: this.getClientSecret(),
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: this.getCallbackUrl(req)
    });
  },

  async refreshAccessToken(refreshToken) {
    return this._tokenRequest({
      client_id: this.getClientId(),
      client_secret: this.getClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: String(refreshToken)
    });
  },

  async fetchUserProfile(accessToken) {
    const res = await fetch(`${MP_API}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
    const raw = await res.text();
    if (!res.ok) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  },

  expiresAtFromToken(tokenData) {
    const sec = Number(tokenData?.expires_in);
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return new Date(Date.now() + sec * 1000);
  },

  async assertMpUserDisponivel(tenantId, mpUserId) {
    if (!mpUserId) return;
    const duplicado = await prisma.tenant.findFirst({
      where: {
        mpUserId: String(mpUserId),
        id: { not: Number(tenantId) }
      },
      select: { id: true, nome: true, slug: true }
    });
    if (duplicado) {
      throw new Error(
        `Esta conta Mercado Pago já está vinculada à loja "${duplicado.nome}" (/${duplicado.slug}).`
      );
    }
  },

  async salvarTokens(tenantId, tokenData) {
    const mpUserId = String(tokenData.user_id || tokenData.userId || '');
    await this.assertMpUserDisponivel(tenantId, mpUserId);

    const profile = await this.fetchUserProfile(tokenData.access_token);
    const nickname = profile?.nickname || profile?.email || null;

    return prisma.tenant.update({
      where: { id: Number(tenantId) },
      data: {
        mpUserId: mpUserId || null,
        mpAccessToken: tokenData.access_token,
        mpRefreshToken: tokenData.refresh_token || null,
        mpTokenExpiresAt: this.expiresAtFromToken(tokenData),
        mpNickname: nickname,
        mpConnectedAt: new Date(),
        wooviAtivo: true
      }
    });
  },

  async getSellerAccessToken(tenant) {
    if (!tenant?.mpAccessToken) {
      throw new Error('Conta Mercado Pago não conectada.');
    }

    const expiresAt = tenant.mpTokenExpiresAt ? new Date(tenant.mpTokenExpiresAt) : null;
    const stillValid = expiresAt && expiresAt.getTime() > Date.now() + REFRESH_BUFFER_MS;
    if (stillValid) return tenant.mpAccessToken;

    if (!tenant.mpRefreshToken) return tenant.mpAccessToken;

    const tokenData = await this.refreshAccessToken(tenant.mpRefreshToken);
    const atualizado = await this.salvarTokens(tenant.id, {
      ...tokenData,
      user_id: tenant.mpUserId || tokenData.user_id
    });
    return atualizado.mpAccessToken;
  },

  isTenantConnected(tenant) {
    return !!(tenant?.mpAccessToken && tenant?.mpUserId);
  },

  async desconectar(tenantId) {
    return prisma.tenant.update({
      where: { id: Number(tenantId) },
      data: {
        mpUserId: null,
        mpAccessToken: null,
        mpRefreshToken: null,
        mpTokenExpiresAt: null,
        mpNickname: null,
        mpConnectedAt: null,
        wooviAtivo: false
      }
    });
  }
};

module.exports = MercadoPagoOAuthService;
