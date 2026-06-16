/**
 * Integração Woovi (OpenPix) — operada pela plataforma VouRifar.
 * Baseado no padrão do projeto TIP PAGE.
 * App ID fica no .env; organizador informa apenas a chave PIX na Carteira.
 */
const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';

// Woovi exige que split.value < charge.value - taxa_woovi.
// Taxa estimada: ~0,8% com mínimo de R$0,50 (igual ao TIP PAGE).
function estimarTaxaWoovi(totalCents) {
  const pct = Math.ceil(totalCents * 0.008);
  const min = parseInt(process.env.WOOVI_TAXA_CENTS || '50'); // R$0,50
  return Math.max(pct, min);
}

function parseWooviError(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.message === 'string') return data.message;
    const first = data?.errors?.[0];
    if (first?.description) return first.description;
    if (first?.message) return first.message;
  } catch (_) { /* ignore */ }
  return typeof raw === 'string' ? raw.trim() : 'Falha na API Woovi.';
}

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

    const raw = await res.text();
    if (!res.ok) {
      console.error(`[Woovi] ${options.method || 'GET'} ${path} → ${res.status}:`, raw);
      throw new Error(parseWooviError(raw) || `Woovi HTTP ${res.status}`);
    }
    try { return JSON.parse(raw); } catch (_) { return {}; }
  },

  /**
   * Registra subconta Woovi com a chave PIX do organizador.
   * Idempotente: ignora apenas erros de "já existe" com padrões precisos.
   * Segue o mesmo padrão do TIP PAGE (nunca engole erros desconhecidos).
   */
  async ensureSubconta(tenant) {
    if (!tenant?.pixChave) return;

    try {
      await this._request('/subaccount', {
        method: 'POST',
        body: JSON.stringify({
          name: `${tenant.nome || tenant.slug}`.slice(0, 64),
          pixKey: tenant.pixChave
        })
      });
      console.log(`[Woovi] Subconta criada: ${tenant.pixChave}`);
    } catch (err) {
      const msg = String(err.message || '').toLowerCase();
      // Só ignora se for realmente "já existe" — NÃO inclui "found" (evita engolir "not found")
      const jaExiste = msg.includes('already exist')
        || msg.includes('já exist')
        || msg.includes('já cadastr')
        || msg.includes('subaccount already')
        || msg.includes('duplicate')
        || msg.includes('duplicad');
      if (jaExiste) {
        console.log(`[Woovi] Subconta já registrada: ${tenant.pixChave}`);
        return;
      }
      // Qualquer outro erro é propagado — o organizador precisa ser informado
      throw new Error(`Não foi possível registrar sua chave PIX na Woovi: ${err.message}`);
    }
  },

  async criarCobranca(tenant, { correlationID, valorReais, valorOrganizadorReais, comentario, cliente }) {
    if (!this.isConfigured(tenant)) {
      throw new Error('Informe sua chave PIX na Carteira para receber pagamentos.');
    }

    // Garante que a subconta existe antes de criar o split
    await this.ensureSubconta(tenant);

    const totalCents = Math.round(Number(valorReais) * 100);
    let organizerCents = Math.round(Number(valorOrganizadorReais ?? valorReais) * 100);

    if (totalCents < 1) throw new Error('Valor da cobrança inválido.');
    if (organizerCents < 1) throw new Error('Valor do organizador inválido.');

    // Calcular teto do split: total - taxa_woovi - 1 centavo de reserva (igual ao TIP PAGE)
    const wooviFee = estimarTaxaWoovi(totalCents);
    const maxSplitCents = Math.max(0, totalCents - wooviFee - 1);

    if (organizerCents >= totalCents) {
      organizerCents = maxSplitCents;
    } else if (organizerCents > maxSplitCents) {
      organizerCents = maxSplitCents;
    }

    if (organizerCents < 1) {
      throw new Error('Valor da cota muito baixo para cobrar via PIX com split.');
    }

    const body = {
      correlationID: String(correlationID),
      value: totalCents,
      comment: String(comentario || 'Pagamento de rifa').replace(/[^\w\s\-.,@]/g, '').slice(0, 120),
      splits: [{
        pixKey: tenant.pixChave,
        value: organizerCents,
        splitType: 'SPLIT_SUB_ACCOUNT'   // igual ao TIP PAGE
      }]
    };

    if (cliente?.nome) {
      body.customer = { name: cliente.nome };
      if (cliente.email) body.customer.email = cliente.email;
      if (cliente.telefone) body.customer.phone = cliente.telefone.replace(/\D/g, '');
      if (cliente.cpf) body.customer.taxID = cliente.cpf.replace(/\D/g, '');
    }

    let data;
    try {
      data = await this._request('/charge', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    } catch (err) {
      const msg = String(err.message || '').toLowerCase();
      // Se Woovi reclamar de "conta virtual", tenta recriar a subconta e retry
      if (msg.includes('conta virtual') || msg.includes('virtual account')) {
        console.warn(`[Woovi] Subconta inválida para ${tenant.pixChave} — recriando e tentando novamente...`);
        await this._request('/subaccount', {
          method: 'POST',
          body: JSON.stringify({
            name: `${tenant.nome || tenant.slug}`.slice(0, 64),
            pixKey: tenant.pixChave
          })
        }).catch((e) => { throw new Error(`Chave PIX não está registrada como conta virtual Woovi. Recadastre sua chave na Carteira. Detalhe: ${e.message}`); });

        data = await this._request('/charge', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      } else {
        throw err;
      }
    }

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
