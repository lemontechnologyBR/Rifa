/**
 * Facade de pagamentos — Mercado Pago (ativo) ou Woovi (legado, desativado por padrão).
 */
const WooviService = require('./wooviService');
const MercadoPagoService = require('./mercadoPagoService');

const WOOVI_ENABLED = process.env.WOOVI_ENABLED === 'true';

function activeProvider() {
  if (MercadoPagoService.isPlatformConfigured()) return 'mercadopago';
  if (WOOVI_ENABLED && WooviService.isPlatformConfigured()) return 'woovi';
  return null;
}

const PaymentService = {
  getProvider() {
    return activeProvider();
  },

  isPlatformConfigured() {
    return !!activeProvider();
  },

  isConfigured(tenant) {
    const provider = activeProvider();
    if (provider === 'mercadopago') return MercadoPagoService.isConfigured(tenant);
    if (provider === 'woovi') return WooviService.isConfigured(tenant);
    return false;
  },

  async ensureTenantReady(tenant) {
    if (activeProvider() === 'woovi') {
      await WooviService.ensureSubconta(tenant);
    }
  },

  async criarCobranca(tenant, opts) {
    const provider = activeProvider();
    if (provider === 'mercadopago') {
      return MercadoPagoService.criarCobranca(tenant, opts);
    }
    if (provider === 'woovi') {
      return WooviService.criarCobranca(tenant, opts);
    }
    throw new Error('Gateway de pagamento não configurado.');
  },

  async consultarStatus(paymentRef) {
    const provider = activeProvider();
    if (provider === 'mercadopago') {
      return MercadoPagoService.consultarStatus(paymentRef);
    }
    if (provider === 'woovi') {
      return WooviService.consultarStatus(paymentRef);
    }
    return null;
  },

  pagamentoConfirmado(status) {
    const provider = activeProvider();
    if (provider === 'mercadopago') {
      return MercadoPagoService.pagamentoConfirmado(status);
    }
    if (provider === 'woovi') {
      const s = String(status || '').toUpperCase();
      return ['COMPLETED', 'CONFIRMED', 'PAID'].some((x) => s.includes(x));
    }
    return false;
  },

  extrairReferenciaWebhook(payload, query = {}) {
    const provider = activeProvider();
    if (provider === 'mercadopago') {
      return MercadoPagoService.extrairPaymentId(payload, query);
    }
    if (provider === 'woovi') {
      return WooviService.extrairCorrelationId(payload);
    }
    return null;
  }
};

module.exports = PaymentService;
