/**
 * Integração Mercado Pago — PIX com split OAuth (application_fee) ou legado (conta plataforma).
 */
const MercadoPagoOAuthService = require('./mercadoPagoOAuthService');
const { TAXA_PLATAFORMA } = require('../lib/config');

const MP_API = process.env.MERCADOPAGO_API_BASE || 'https://api.mercadopago.com';

function parseMpError(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const msg = data?.message || data?.error;
    if (typeof msg === 'string' && msg.trim()) return msg;
    const cause = data?.cause?.[0];
    if (cause?.description) return cause.description;
    if (cause?.code) return String(cause.code);
  } catch (_) { /* ignore */ }
  return typeof raw === 'string' ? raw.trim() : 'Falha na API Mercado Pago.';
}

function splitNome(nome) {
  const parts = String(nome || 'Comprador VouRifar').trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || 'Comprador',
    last: parts.slice(1).join(' ') || 'VouRifar'
  };
}

const MercadoPagoService = {
  getAccessToken() {
    return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  },

  getPublicKey() {
    return String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim();
  },

  isPlatformConfigured() {
    return !!this.getAccessToken() || MercadoPagoOAuthService.isSplitConfigured();
  },

  usesSplit(tenant) {
    return MercadoPagoOAuthService.isSplitConfigured() && MercadoPagoOAuthService.isTenantConnected(tenant);
  },

  isConfigured(tenant) {
    if (!this.isPlatformConfigured()) return false;
    if (MercadoPagoOAuthService.isSplitConfigured()) {
      return MercadoPagoOAuthService.isTenantConnected(tenant);
    }
    return !!tenant?.pixChave;
  },

  notificationUrl() {
    const base = String(process.env.APP_URL || '').replace(/\/$/, '');
    return base ? `${base}/webhooks/mercadopago` : '';
  },

  async _request(method, path, body = null, extraHeaders = {}, accessToken = null) {
    const token = accessToken || this.getAccessToken();
    if (!token) throw new Error('Mercado Pago não configurado na plataforma.');

    const options = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders
      }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${MP_API}${path}`, options);
    const raw = await res.text();
    if (!res.ok) {
      console.error(`[MercadoPago] ${method} ${path} → ${res.status}:`, raw.slice(0, 500));
      throw new Error(parseMpError(raw) || `Mercado Pago HTTP ${res.status}`);
    }
    try { return JSON.parse(raw); } catch (_) { return {}; }
  },

  async criarCobranca(tenant, { correlationID, valorReais, comentario, cliente, expiraEm }) {
    if (!this.isConfigured(tenant)) {
      if (MercadoPagoOAuthService.isSplitConfigured()) {
        throw new Error('Conecte sua conta Mercado Pago na Carteira para receber pagamentos.');
      }
      throw new Error('Informe sua chave PIX na Carteira para receber pagamentos.');
    }

    const valor = Number(valorReais);
    if (!Number.isFinite(valor) || valor < 0.01) {
      throw new Error('Valor da cobrança inválido.');
    }

    const { first, last } = splitNome(cliente?.nome);
    const email = String(cliente?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('E-mail do comprador é obrigatório para pagamento PIX.');
    }

    const body = {
      transaction_amount: Math.round(valor * 100) / 100,
      description: String(comentario || 'Pagamento de rifa').slice(0, 120),
      payment_method_id: 'pix',
      external_reference: String(correlationID),
      payer: {
        email,
        first_name: first,
        last_name: last
      },
      metadata: {
        tenant_id: String(tenant.id),
        tenant_slug: tenant.slug || '',
        mp_user_id: tenant.mpUserId || '',
        split: this.usesSplit(tenant) ? 'oauth' : 'legacy'
      }
    };

    const notificationUrl = this.notificationUrl();
    if (notificationUrl.startsWith('https://')) {
      body.notification_url = notificationUrl;
    }

    if (cliente?.cpf) {
      body.payer.identification = {
        type: 'CPF',
        number: String(cliente.cpf).replace(/\D/g, '')
      };
    }

    if (expiraEm) {
      const exp = new Date(expiraEm);
      if (!Number.isNaN(exp.getTime()) && exp > new Date()) {
        body.date_of_expiration = exp.toISOString();
      }
    }

    let accessToken = this.getAccessToken();
    if (this.usesSplit(tenant)) {
      accessToken = await MercadoPagoOAuthService.getSellerAccessToken(tenant);
      body.application_fee = Math.round(valor * TAXA_PLATAFORMA * 100) / 100;
      console.log(`[MercadoPago] Split OAuth tenant #${tenant.id} — fee R$ ${body.application_fee}`);
    }

    const data = await this._request('POST', '/v1/payments', body, {
      'X-Idempotency-Key': String(correlationID).slice(0, 64)
    }, accessToken);

    const tx = data?.point_of_interaction?.transaction_data || {};
    const qrBase64 = tx.qr_code_base64
      ? `data:image/png;base64,${tx.qr_code_base64}`
      : '';

    return {
      paymentId: String(data.id),
      correlationID: String(correlationID),
      brCode: tx.qr_code || '',
      qrCodeImage: qrBase64,
      ticketUrl: tx.ticket_url || '',
      status: data.status || 'pending',
      split: this.usesSplit(tenant)
    };
  },

  async obterPagamento(paymentId, accessToken = null) {
    if (!paymentId) throw new Error('ID do pagamento ausente.');
    return this._request('GET', `/v1/payments/${encodeURIComponent(String(paymentId))}`, null, {}, accessToken);
  },

  async consultarStatus(paymentId) {
    if (!this.isPlatformConfigured() || !paymentId) return null;
    try {
      const data = await this.obterPagamento(paymentId);
      return data?.status || null;
    } catch (err) {
      console.error(`[MercadoPago] consultarStatus(${paymentId}):`, err.message);
      return null;
    }
  },

  extrairPaymentId(payload, query = {}) {
    if (query?.id && (query?.topic === 'payment' || query?.type === 'payment')) {
      return String(query.id);
    }
    if (payload?.data?.id) return String(payload.data.id);
    if (payload?.id && payload?.type === 'payment') return String(payload.id);
    return null;
  },

  pagamentoConfirmado(status) {
    const s = String(status || '').toLowerCase();
    return s === 'approved' || s === 'authorized';
  }
};

module.exports = MercadoPagoService;
