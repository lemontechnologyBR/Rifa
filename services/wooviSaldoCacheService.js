/**
 * Cache do saldo agregado das subcontas Woovi (evita rate-limit no painel).
 * Atualizado em background; o Super Admin lê o valor em cache.
 */
const prisma = require('../lib/prisma');
const WooviService = require('./wooviService');
const { isReservaSacavelWoovi } = require('../lib/carteiraSaldo');

const CACHE_KEY = 'woovi_saldos_subcontas';
const TTL_MS = 5 * 60 * 1000;
const DELAY_MS = 900;
const RATE_LIMIT_PAUSE_MS = 65000;

let memory = {
  subcontasLive: null,
  updatedAt: 0,
  ok: 0,
  fail: 0,
  tenants: 0,
  refreshing: false
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function loadFromDb() {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: CACHE_KEY } });
    if (!row?.value) return;
    const parsed = JSON.parse(row.value);
    if (typeof parsed.subcontasLive === 'number') {
      memory = {
        ...memory,
        subcontasLive: parsed.subcontasLive,
        updatedAt: Number(parsed.updatedAt) || 0,
        ok: Number(parsed.ok) || 0,
        fail: Number(parsed.fail) || 0,
        tenants: Number(parsed.tenants) || 0
      };
    }
  } catch (_) { /* ignore */ }
}

async function saveToDb() {
  const payload = JSON.stringify({
    subcontasLive: memory.subcontasLive,
    updatedAt: memory.updatedAt,
    ok: memory.ok,
    fail: memory.fail,
    tenants: memory.tenants
  });
  await prisma.platformSetting.upsert({
    where: { key: CACHE_KEY },
    create: { key: CACHE_KEY, value: payload },
    update: { value: payload }
  });
}

async function listarTenantsRelevantes() {
  const [tenants, reservas, saques] = await Promise.all([
    prisma.tenant.findMany({
      where: { status: 'ativo', pixChave: { not: null } },
      select: { id: true, slug: true, pixChave: true }
    }),
    prisma.reserva.findMany({
      where: {
        statusPagamento: 'confirmado',
        wooviCorrelationId: { not: null }
      },
      select: {
        wooviCorrelationId: true,
        rifa: { select: { tenantId: true } }
      }
    }),
    prisma.saque.findMany({
      where: { status: { in: ['solicitado', 'processando', 'concluido'] } },
      select: { tenantId: true },
      distinct: ['tenantId']
    })
  ]);

  const ids = new Set(saques.map((s) => s.tenantId));
  for (const r of reservas) {
    if (isReservaSacavelWoovi(r) && r.rifa?.tenantId) ids.add(r.rifa.tenantId);
  }

  return tenants.filter((t) => ids.has(t.id));
}

async function consultarComRetry(tenant) {
  let saldo = await WooviService.consultarSaldoSubconta(tenant);
  if (saldo != null) return { saldo, rateLimited: false };
  return { saldo: null, rateLimited: false };
}

const WooviSaldoCacheService = {
  async getCached() {
    if (memory.subcontasLive == null && memory.updatedAt === 0) {
      await loadFromDb();
    }
    const age = Date.now() - memory.updatedAt;
    const fresh = memory.subcontasLive != null && age < TTL_MS * 3;
    return {
      subcontasLive: memory.subcontasLive,
      updatedAt: memory.updatedAt,
      ageMs: memory.updatedAt ? age : null,
      fresh,
      ok: memory.ok,
      fail: memory.fail,
      tenants: memory.tenants,
      refreshing: memory.refreshing
    };
  },

  /** Dispara refresh em background se cache velho ou vazio. */
  maybeRefreshAsync() {
    const age = Date.now() - memory.updatedAt;
    if (memory.refreshing) return;
    if (memory.subcontasLive != null && age < TTL_MS) return;
    setImmediate(() => {
      this.refresh().catch((err) => console.error('[WooviSaldoCache]', err.message));
    });
  },

  async refresh() {
    if (memory.refreshing) return memory;
    if (!WooviService.isPlatformConfigured()) return memory;

    memory.refreshing = true;
    console.log('[WooviSaldoCache] Atualizando soma das subcontas...');
    try {
      const tenants = await listarTenantsRelevantes();
      let sum = 0;
      let ok = 0;
      let fail = 0;
      let consecutiveNull = 0;

      for (let i = 0; i < tenants.length; i++) {
        const t = tenants[i];
        if (i > 0) await sleep(DELAY_MS);
        try {
          const { saldo } = await consultarComRetry(t);
          if (saldo == null) {
            fail++;
            consecutiveNull++;
            // possível rate-limit: pausa e tenta este tenant de novo
            if (consecutiveNull >= 3) {
              console.warn('[WooviSaldoCache] Possível rate-limit — pausando 65s');
              await sleep(RATE_LIMIT_PAUSE_MS);
              consecutiveNull = 0;
              const retry = await WooviService.consultarSaldoSubconta(t);
              if (retry != null) {
                sum += Number(retry);
                ok++;
                fail--;
              }
            }
          } else {
            consecutiveNull = 0;
            sum += Number(saldo);
            ok++;
          }
        } catch (_) {
          fail++;
        }
      }

      memory = {
        ...memory,
        subcontasLive: round2(sum),
        updatedAt: Date.now(),
        ok,
        fail,
        tenants: tenants.length,
        refreshing: false
      };
      await saveToDb();
      console.log(
        `[WooviSaldoCache] Subcontas R$ ${memory.subcontasLive} (${ok} ok / ${fail} falha / ${tenants.length} tenants)`
      );
      return memory;
    } catch (err) {
      memory.refreshing = false;
      throw err;
    }
  }
};

module.exports = WooviSaldoCacheService;
