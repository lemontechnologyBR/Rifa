/**
 * Job de sincronização automática de pagamentos Woovi.
 * Roda a cada 2 minutos e confirma reservas cujo pagamento
 * já foi confirmado na Woovi mas o webhook ainda não chegou.
 */
const prisma = require('../lib/prisma');
const WooviService = require('../services/wooviService');
const ReservaService = require('../services/reservaService');

const INTERVALO_MS = 2 * 60 * 1000; // 2 minutos
const STATUS_PAGOS = ['COMPLETED', 'CONFIRMED', 'paid'];

async function sincronizar() {
  if (!WooviService.isPlatformConfigured()) return;

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
      const status = await WooviService.consultarStatus(reserva.wooviCorrelationId);
      if (status && STATUS_PAGOS.some(s => status.toUpperCase().includes(s.toUpperCase()))) {
        await ReservaService.confirmarViaWoovi(reserva.wooviCorrelationId);
        console.log(`[SyncPIX] Reserva #${reserva.id} confirmada automaticamente (status Woovi: ${status})`);
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
  // Primeira rodada após 30s (aguarda o servidor subir)
  setTimeout(() => {
    sincronizar();
    setInterval(sincronizar, INTERVALO_MS);
  }, 30_000);

  console.log(`[SyncPIX] Job iniciado — verifica pagamentos a cada ${INTERVALO_MS / 60000} min`);
}

module.exports = { iniciar, sincronizar };
