/**
 * Facade de pagamentos — seleção automática por tenant:
 *   - Mercado Pago OAuth  → tenant conectou a conta MP (recebe direto, sem saque)
 *   - Woovi (plataforma)  → fallback quando MP não conectado (plataforma coleta, organizer saca)
 */
const WooviService = require('./wooviService');
const MercadoPagoService = require('./mercadoPagoService');

const {
  TAXA_PLATAFORMA,
  TAXA_PLATAFORMA_WOOVI,
  TAXA_FIXA_COTA_WOOVI
} = require('../lib/config');

const WOOVI_ENABLED = process.env.WOOVI_ENABLED === 'true';

/** Detecta o provider correto para um tenant específico. */
function getProviderForTenant(tenant) {
  if (tenant && MercadoPagoService.isConfigured(tenant)) return 'mercadopago';
  if (WOOVI_ENABLED && WooviService.isPlatformConfigured()) {
    if (!tenant) return 'woovi';
    if (tenant.pixChave) return 'woovi';
  }
  return null;
}

/**
 * Detecta o provider pelo formato da referência de pagamento armazenada.
 * MP payment IDs são numéricos puros; Woovi usa UUIDs ou "reserva-N".
 */
function detectProviderFromRef(paymentRef) {
  if (!paymentRef) return null;
  return /^\d+$/.test(String(paymentRef)) ? 'mercadopago' : 'woovi';
}

const PaymentService = {
  /**
   * Retorna o provider ativo para o tenant dado.
   * Sem tenant: retorna provider de plataforma para compatibilidade (hooks, logs).
   */
  getProvider(tenant) {
    if (tenant) return getProviderForTenant(tenant);
    // Sem tenant — detecta plataforma (usado apenas em contextos sem tenant)
    if (MercadoPagoService.isPlatformConfigured()) return 'mercadopago';
    if (WOOVI_ENABLED && WooviService.isPlatformConfigured()) return 'woovi';
    return null;
  },

  isPlatformConfigured() {
    return MercadoPagoService.isPlatformConfigured() ||
           (WOOVI_ENABLED && WooviService.isPlatformConfigured());
  },

  isConfigured(tenant) {
    return !!getProviderForTenant(tenant);
  },

  async ensureTenantReady(tenant) {
    if (getProviderForTenant(tenant) === 'woovi') {
      await WooviService.ensureSubconta(tenant);
    }
  },

  async criarCobranca(tenant, opts) {
    const provider = getProviderForTenant(tenant);
    if (provider === 'mercadopago') {
      return MercadoPagoService.criarCobranca(tenant, opts);
    }
    if (provider === 'woovi') {
      return WooviService.criarCobranca(tenant, opts);
    }
    throw new Error('Gateway de pagamento não configurado. Configure a Carteira no painel.');
  },

  async consultarStatus(paymentRef) {
    const provider = detectProviderFromRef(paymentRef);
    if (provider === 'mercadopago') {
      return MercadoPagoService.consultarStatus(paymentRef);
    }
    if (provider === 'woovi') {
      return WooviService.consultarStatus(paymentRef);
    }
    return null;
  },

  pagamentoConfirmado(status) {
    const s = String(status || '');
    // Mercado Pago
    if (['approved', 'authorized'].includes(s.toLowerCase())) return true;
    // Woovi
    if (['COMPLETED', 'CONFIRMED', 'PAID'].some((x) => s.toUpperCase().includes(x))) return true;
    return false;
  },

  extrairReferenciaWebhook(payload, query = {}) {
    // Webhooks chegam em rotas separadas; tentamos MP primeiro, depois Woovi
    const mpRef = MercadoPagoService.extrairPaymentId(payload, query);
    if (mpRef) return mpRef;
    if (WOOVI_ENABLED) return WooviService.extrairCorrelationId(payload);
    return null;
  },

  detectProviderFromRef(paymentRef) {
    return detectProviderFromRef(paymentRef);
  },

  /** Provider usado na cobrança (referência salva > config atual do tenant). */
  getProviderForReserva(reserva, tenant) {
    return detectProviderFromRef(reserva?.wooviCorrelationId) || getProviderForTenant(tenant);
  },

  /** Taxa retida pela plataforma em uma venda confirmada. */
  getTaxaPlataformaReserva(reserva, tenant) {
    const provider = this.getProviderForReserva(reserva, tenant);
    if (provider === 'mercadopago') return TAXA_PLATAFORMA;
    return TAXA_PLATAFORMA_WOOVI;
  },

  /** Valor em reais retido pela plataforma em uma venda. */
  calcularReceitaReserva(reserva, tenant) {
    const valor = Number(reserva?.valorTotal || 0);
    const pct = this.getTaxaPlataformaReserva(reserva, tenant);
    const provider = this.getProviderForReserva(reserva, tenant);
    if (provider === 'woovi') {
      const cotas = Number(reserva?._count?.reservaNumeros || reserva?.numeros?.length || 0);
      return valor * pct + cotas * TAXA_FIXA_COTA_WOOVI;
    }
    return valor * pct;
  },

  /** Rótulo da comissão para UI (ex.: "5% + R$ 0,50/cota"). */
  getTaxaLabelReserva(reserva, tenant) {
    const provider = this.getProviderForReserva(reserva, tenant);
    const pct = Math.round(this.getTaxaPlataformaReserva(reserva, tenant) * 100);
    if (provider === 'woovi') {
      return `${pct}% + R$ ${TAXA_FIXA_COTA_WOOVI.toFixed(2).replace('.', ',')}/cota`;
    }
    return `${pct}%`;
  }
};

module.exports = PaymentService;
