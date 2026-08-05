/**
 * Cálculos de saldo para scripts de diagnóstico (alinhado à Carteira Woovi).
 */
const {
  ORGANIZADOR_PERCENTUAL_WOOVI,
  taxaFixaCotaWooviPara
} = require('../../lib/config');

/** Vendas antigas com payment id numérico no campo wooviCorrelationId (ex-Mercado Pago). */
function isLegacyMpPaymentRef(ref) {
  if (ref == null || ref === '') return false;
  return /^\d+$/.test(String(ref));
}

function parteOrganizadorReserva(reserva) {
  const valor = Number(reserva.valorTotal || 0);
  const cotas = reserva._count?.reservaNumeros ?? reserva.cotas ?? 0;
  const taxaFixa = taxaFixaCotaWooviPara(reserva.createdAt);
  return Math.max(0, valor * ORGANIZADOR_PERCENTUAL_WOOVI - cotas * taxaFixa);
}

function classificarReserva(reserva) {
  if (!reserva.wooviCorrelationId) return 'sem_ref';
  if (isLegacyMpPaymentRef(reserva.wooviCorrelationId)) return 'legado_mp';
  return 'plataforma';
}

module.exports = {
  isLegacyMpPaymentRef,
  parteOrganizadorReserva,
  classificarReserva,
  ORGANIZADOR_PERCENTUAL_WOOVI
};
