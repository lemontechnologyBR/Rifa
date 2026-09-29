/**
 * Job de sincronização automática de pagamentos PIX.
 * Confirma reservas cujo pagamento já foi aprovado mas o webhook ainda não chegou.
 * Inclui PIX pago após a reserva expirar (dá baixa em vez de deixar órfão).
 */
const prisma = require('../lib/prisma');
const PaymentService = require('../services/paymentService');
const ReservaService = require('../services/reservaService');

const INTERVALO_MS = 2 * 60 * 1000;
/** Janela para reprocessar expiradas com cobrança Woovi (dias). */
const DIAS_EXPIRADA_RETROATIVA = 14;

async function sincronizar() {
  if (!PaymentService.isPlatformConfigured()) return;

  let candidatas;
  try {
    const desde = new Date(Date.now() - DIAS_EXPIRADA_RETROATIVA * 24 * 60 * 60 * 1000);
    candidatas = await prisma.reserva.findMany({
      where: {
        wooviCorrelationId: { not: null },
        OR: [
          { statusPagamento: 'pendente' },
          { statusPagamento: 'expirado', createdAt: { gte: desde } }
        ]
      },
      take: 40,
      orderBy: { createdAt: 'desc' }
    });
  } catch (e) {
    console.error('[SyncPIX] Erro ao buscar pendentes:', e.message);
    return;
  }

  if (!candidatas.length) return;

  let confirmados = 0;
  for (const reserva of candidatas) {
    try {
      const status = await PaymentService.consultarStatus(reserva.wooviCorrelationId);
      if (PaymentService.pagamentoConfirmado(status)) {
        await ReservaService.confirmarViaGateway(reserva.wooviCorrelationId);
        console.log(
          `[SyncPIX] Reserva #${reserva.id} confirmada automaticamente (status: ${status}, era: ${reserva.statusPagamento})`
        );
        confirmados++;
      }
    } catch (e) {
      if (
        !e.message.includes('confirmado') &&
        !e.message.includes('ainda não confirmado') &&
        !e.message.includes('não confere')
      ) {
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
