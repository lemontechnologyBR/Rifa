/**
 * Job: atualiza cache do saldo agregado das subcontas Woovi.
 */
const WooviSaldoCacheService = require('../services/wooviSaldoCacheService');

const INTERVAL_MS = 5 * 60 * 1000;

function iniciar() {
  console.log('[SyncWooviSaldos] Job iniciado — atualiza subcontas a cada 5 min');

  const tick = () => {
    WooviSaldoCacheService.refresh().catch((err) => {
      console.error('[SyncWooviSaldos]', err.message);
    });
  };

  // primeira rodada após 20s (não competir com boot)
  setTimeout(tick, 20 * 1000);
  setInterval(tick, INTERVAL_MS);
}

module.exports = { iniciar };
