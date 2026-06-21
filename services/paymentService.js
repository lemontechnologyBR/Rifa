/**
 * Facade de pagamentos — seleção automática por tenant:
 *   - Mercado Pago OAuth  → tenant conectou a conta MP (recebe direto, sem saque)
 *   - Woovi (plataforma)  → fallback quando MP não conectado (plataforma coleta, organizer saca)
 */
const WooviService = require('./wooviService');
const MercadoPagoService = require('./mercadoPagoService');

const WOOVI_ENABLED = process.env.WOOVI_ENABLED === 'true';

/** Detecta o provider correto para um tenant específico. */
function getProviderForTenant(tenant) {
  if (tenant && MercadoPagoService.isConfigured(tenant)) return 'mercadopago';
  if (WOOVI_ENABLED && WooviService.isPlatformConfigured()) return 'woovi';
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
  }
};

module.exports = PaymentService;
