/**
 * Job: sincroniza KYC Didit para sessões travadas (sem depender de reset manual).
 */
const DiditService = require('../services/diditService');

const INTERVALO_MS = 3 * 60 * 1000;

async function sincronizar() {
  if (!DiditService.isConfigured()) return;
  try {
    const r = await DiditService.sincronizarPendentes({ limit: 50 });
    if (r.synced || r.aprovados || r.erros) {
      console.log(
        `[SyncKyc] total=${r.total} synced=${r.synced} aprovados=${r.aprovados} erros=${r.erros}`
      );
    }
  } catch (e) {
    console.error('[SyncKyc] Erro:', e.message);
  }
}

function iniciar() {
  setTimeout(() => {
    sincronizar();
    setInterval(sincronizar, INTERVALO_MS);
  }, 70_000);

  console.log(`[SyncKyc] Job iniciado — sync Didit a cada ${INTERVALO_MS / 60000} min`);
}

module.exports = { iniciar, sincronizar };
