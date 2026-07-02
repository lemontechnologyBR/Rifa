/**
 * Job de sincronização de saques PIX Out (Woovi).
 * Complementa webhooks OPENPIX:MOVEMENT_* quando não chegam a tempo.
 */
const SaqueService = require('../services/saqueService');
const WooviService = require('../services/wooviService');

const INTERVALO_MS = 2 * 60 * 1000;

async function sincronizar() {
  if (process.env.WOOVI_ENABLED !== 'true' || !WooviService.isPlatformConfigured()) return;
  try {
    await SaqueService.sincronizarPendentes();
  } catch (e) {
    console.error('[SyncSaque] Erro:', e.message);
  }
}

function iniciar() {
  setTimeout(() => {
    sincronizar();
    setInterval(sincronizar, INTERVALO_MS);
  }, 45_000);

  console.log(`[SyncSaque] Job iniciado — verifica saques a cada ${INTERVALO_MS / 60000} min`);
}

module.exports = { iniciar, sincronizar };
