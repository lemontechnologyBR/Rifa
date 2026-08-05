/**
 * Facade de pagamentos — Woovi (PIX plataforma).
 */
const WooviService = require('./wooviService');

const {
  TAXA_PLATAFORMA_WOOVI,
  TAXA_FIXA_COTA_WOOVI,
  taxaFixaCotaWooviPara
} = require('../lib/config');

const WOOVI_ENABLED = process.env.WOOVI_ENABLED === 'true';

function getProviderForTenant(tenant) {
  if (WOOVI_ENABLED && WooviService.isPlatformConfigured()) {
    if (!tenant) return 'woovi';
    if (tenant.pixChave) return 'woovi';
  }
  return null;
}

const PaymentService = {
  getProvider(tenant) {
    if (tenant) return getProviderForTenant(tenant);
    if (WOOVI_ENABLED && WooviService.isPlatformConfigured()) return 'woovi';
    return null;
  },

  isPlatformConfigured() {
    return WOOVI_ENABLED && WooviService.isPlatformConfigured();
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
    if (getProviderForTenant(tenant) === 'woovi') {
      return WooviService.criarCobranca(tenant, opts);
    }
    throw new Error('Gateway de pagamento não configurado. Configure a chave PIX na Carteira.');
  },

  async consultarStatus(paymentRef) {
    if (!paymentRef) return null;
    return WooviService.consultarStatus(paymentRef);
  },

  pagamentoConfirmado(status) {
    const s = String(status || '');
    if (['approved', 'authorized'].includes(s.toLowerCase())) return true;
    if (['COMPLETED', 'CONFIRMED', 'PAID'].some((x) => s.toUpperCase().includes(x))) return true;
    return false;
  },

  extrairReferenciaWebhook(payload) {
    if (!WOOVI_ENABLED) return null;
    return WooviService.extrairCorrelationId(payload);
  },

  getProviderForReserva(reserva, tenant) {
    return getProviderForTenant(tenant) || (reserva?.wooviCorrelationId ? 'woovi' : null);
  },

  getTaxaPlataformaReserva() {
    return TAXA_PLATAFORMA_WOOVI;
  },

  calcularReceitaReserva(reserva) {
    const valor = Number(reserva?.valorTotal || 0);
    const cotas = Number(reserva?._count?.reservaNumeros || reserva?.numeros?.length || 0);
    return valor * TAXA_PLATAFORMA_WOOVI + cotas * taxaFixaCotaWooviPara(reserva?.createdAt);
  },

  getTaxaLabelReserva() {
    const pct = Math.round(TAXA_PLATAFORMA_WOOVI * 100);
    return `${pct}% + R$ ${TAXA_FIXA_COTA_WOOVI.toFixed(2).replace('.', ',')}/cota`;
  }
};

module.exports = PaymentService;
