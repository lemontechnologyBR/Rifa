/**
 * Job de sincronização automática de pagamentos PIX.
 * Confirma reservas cujo pagamento já foi aprovado mas o webhook ainda não chegou.
 */
const prisma = require('../lib/prisma');
const PaymentService = require('../services/paymentService');
const ReservaService = require('../services/reservaService');

const INTERVALO_MS = 2 * 60 * 1000;

async function sincronizar() {
  if (!PaymentService.isPlatformConfigured()) return;

  let pendentes;
  try {
    pendentes = await prisma.reserva.findMany({
      where: {
        statusPagamento: 'pendente',
        wooviCorrelationId: { not: null }
      },
      take: 30,
      orderBy: { createdAt: 'desc' }
    });
  } catch (e) {
    console.error('[SyncPIX] Erro ao buscar pendentes:', e.message);
    return;
  }

  if (!pendentes.length) return;

  let confirmados = 0;
  for (const reserva of pendentes) {
    try {
      const status = await PaymentService.consultarStatus(reserva.wooviCorrelationId);
      if (PaymentService.pagamentoConfirmado(status)) {
        await ReservaService.confirmarViaGateway(reserva.wooviCorrelationId);
        console.log(`[SyncPIX] Reserva #${reserva.id} confirmada automaticamente (status: ${status})`);
        confirmados++;
      }
    } catch (e) {
      if (!e.message.includes('confirmado') && !e.message.includes('expirad')) {
        console.error(`[SyncPIX] Reserva #${reserva.id}:`, e.message);
      }
    }
  }

  if (confirmados > 0) {
    console.log(`[SyncPIX] ${confirmados} pagamento(s) confirmado(s) nesta rodada.`);
  }
}

function iniciar() {
  setTimeout(() => {
    sincronizar();
    setInterval(sincronizar, INTERVALO_MS);
  }, 30_000);

  console.log(`[SyncPIX] Job iniciado — verifica pagamentos a cada ${INTERVALO_MS / 60000} min`);
}

module.exports = { iniciar, sincronizar };
