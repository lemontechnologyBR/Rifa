/**
 * Integração Woovi (OpenPix) — operada pela plataforma VouRifar.
 * App ID fica no .env; organizador informa apenas a chave PIX na Carteira.
 */
const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';

const WooviService = {
  getAppId() {
    return String(process.env.WOOVI_APP_ID || '').trim();
  },

  isPlatformConfigured() {
    return !!this.getAppId();
  },

  isConfigured(tenant) {
    return this.isPlatformConfigured() && !!tenant?.pixChave;
  },

  async _request(path, options = {}) {
    const appId = this.getAppId();
    if (!appId) throw new Error('Woovi não configurada na plataforma.');

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
    if (!res.ok) {
      const msg = data?.error || data?.message || `Woovi HTTP ${res.status}`;
      throw new Error(typeof msg === 'string' ? msg : 'Falha na API Woovi.');
    }
    return data;
  },

  /** Registra subconta Woovi com a chave PIX do organizador (idempotente). */
  async ensureSubconta(tenant) {
    if (!tenant?.pixChave) return;

    try {
      await this._request('/subaccount', {
        method: 'POST',
        body: JSON.stringify({
          name: `${tenant.nome || tenant.slug}`.slice(0, 80),
          pixKey: tenant.pixChave
        })
      });
    } catch (err) {
      const msg = err.message.toLowerCase();
      if (msg.includes('exist') || msg.includes('já') || msg.includes('already')) return;
      throw err;
    }
  },

  async criarCobranca(tenant, { correlationID, valorReais, valorOrganizadorReais, comentario, cliente }) {
    if (!this.isConfigured(tenant)) {
      throw new Error('Informe sua chave PIX na Carteira para receber pagamentos.');
    }

    // Garante que a subconta Woovi existe para esta chave PIX antes de criar o split
    await this.ensureSubconta(tenant);

    const valueCents = Math.round(Number(valorReais) * 100);
    const organizerCentsRaw = Math.round(Number(valorOrganizadorReais ?? valorReais) * 100);
    if (valueCents < 1) throw new Error('Valor da cobrança inválido.');
    if (organizerCentsRaw < 1 || organizerCentsRaw >= valueCents) {
      throw new Error('Valor do organizador inválido.');
    }

    // Woovi exige strict: split.value < charge.value - taxa_woovi
    // Reservamos margem para a taxa da Woovi (padrão R$0,50 ou 2% — o maior).
    // Configure WOOVI_TAXA_CENTS no .env conforme o plano da sua conta Woovi.
    const wooviFeeFixed = parseInt(process.env.WOOVI_TAXA_CENTS || '50'); // default R$0,50
    const wooviFeeEstimCents = Math.max(wooviFeeFixed, Math.ceil(valueCents * 0.02));
    const organizerCents = Math.min(
      organizerCentsRaw,
      valueCents - wooviFeeEstimCents - 1  // -1 para garantir strict <
    );
    if (organizerCents < 1) throw new Error('Valor da cota muito baixo para cobrar via PIX com split.');

    const body = {
      correlationID: String(correlationID),
      value: valueCents,
      comment: String(comentario || 'Pagamento de rifa').replace(/[^\w\s\-.,@]/g, '').slice(0, 120),
      splits: [{
        pixKey: tenant.pixChave,
        value: organizerCents
      }]
    };

    if (cliente?.nome) {
      body.customer = { name: cliente.nome };
      if (cliente.email) body.customer.email = cliente.email;
      if (cliente.telefone) body.customer.phone = cliente.telefone.replace(/\D/g, '');
      if (cliente.cpf) body.customer.taxID = cliente.cpf.replace(/\D/g, '');
    }

    const data = await this._request('/charge', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const charge = data.charge || data;
    return {
      correlationID: charge.correlationID || correlationID,
      brCode: charge.brCode || charge.pixCopiaECola || '',
      qrCodeImage: charge.qrCodeImage || charge.qrCodeUrl || '',
      status: charge.status,
      value: charge.value
    };
  },

  extrairCorrelationId(payload) {
    const charge = payload?.charge || payload?.data?.charge || payload;
    return charge?.correlationID || payload?.correlationID || null;
  }
};

module.exports = WooviService;
