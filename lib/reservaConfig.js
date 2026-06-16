/** Prazo único de reserva/checkout/PIX (minutos). */
const TEMPO_RESERVA_MIN = parseInt(process.env.TEMPO_RESERVA_MIN, 10) || 10;
const TEMPO_RESERVA_MS = TEMPO_RESERVA_MIN * 60 * 1000;

function calcularExpiraEm(from = Date.now()) {
  return new Date(from + TEMPO_RESERVA_MS);
}

function obterExpiraEmReserva(reserva) {
  if (reserva.expiraEm) return new Date(reserva.expiraEm);
  return calcularExpiraEm(new Date(reserva.createdAt).getTime());
}

function reservaExpirada(reserva, agora = new Date()) {
  if (!reserva || reserva.statusPagamento !== 'pendente') return false;
  return obterExpiraEmReserva(reserva) <= agora;
}

module.exports = {
  TEMPO_RESERVA_MIN,
  TEMPO_RESERVA_MS,
  calcularExpiraEm,
  obterExpiraEmReserva,
  reservaExpirada
};
