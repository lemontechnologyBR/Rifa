/**
 * Cálculos de saldo da carteira (Woovi) — compartilhado entre serviço e scripts.
 */

const {
  ORGANIZADOR_PERCENTUAL_WOOVI,
  taxaFixaCotaWooviPara
} = require('./config');

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

function isReservaSacavelWoovi(reserva) {
  return classificarReserva(reserva) === 'plataforma';
}

module.exports = {
  isLegacyMpPaymentRef,
  parteOrganizadorReserva,
  classificarReserva,
  isReservaSacavelWoovi,
  ORGANIZADOR_PERCENTUAL_WOOVI
};
