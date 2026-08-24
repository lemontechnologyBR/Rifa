/**
 * Registro e agregação de pageviews + eventos de funil (Super Admin / tenant).
 */
const prisma = require('../lib/prisma');
const {
  getOrCreateVisitorId,
  attributionFromRequest,
  extractTenantSlug
} = require('../lib/analyticsVisitor');

const RETENTION_DAYS = 90;

const EVENTOS = {
  SIGNUP: 'signup',
  PURCHASE_PENDING: 'purchase_pending',
  PURCHASE_PAID: 'purchase_paid',
  CART_ADD: 'cart_add',
  KYC_START: 'kyc_start',
  KYC_APPROVED: 'kyc_approved',
  RIFA_VIEW: 'rifa_view'
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return d;
}

/** Chave YYYY-MM-DD no fuso local (evita toISOString UTC). */
function localDateKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function labelDia(iso) {
  const [, m, day] = String(iso).split('-');
  return `${day}/${m}`;
}

async function registrar(data) {
  await prisma.pageView.create({ data });
}

async function registrarEvento(data) {
  if (!data || !data.event) return null;
  try {
    return await prisma.analyticsEvent.create({
      data: {
        event: String(data.event).slice(0, 60),
        visitorId: data.visitorId ? String(data.visitorId).slice(0, 80) : null,
        tenantSlug: data.tenantSlug ? String(data.tenantSlug).slice(0, 80) : null,
        rifaId: data.rifaId != null ? Number(data.rifaId) : null,
        valor: data.valor != null ? Number(data.valor) : null,
        source: data.source ? String(data.source).slice(0, 80) : null,
        utmSource: data.utmSource ? String(data.utmSource).slice(0, 80) : null,
        utmCampaign: data.utmCampaign ? String(data.utmCampaign).slice(0, 80) : null,
        meta: data.meta != null
          ? (typeof data.meta === 'string' ? data.meta.slice(0, 500) : JSON.stringify(data.meta).slice(0, 500))
          : null
      }
    });
  } catch (err) {
    console.error('[Analytics] Erro ao registrar evento:', err.message);
    return null;
  }
}

/** Dispara evento a partir de um request HTTP (fire-and-forget). */
function trackFromRequest(req, res, event, extra = {}) {
  try {
    const visitorId = getOrCreateVisitorId(req, res);
    const attr = attributionFromRequest(req);
    const path = (req.originalUrl || req.path || '/').split('?')[0];
    const payload = {
      event,
      visitorId,
      tenantSlug: extra.tenantSlug || extractTenantSlug(path) || req.session?.tenantSlug || null,
      rifaId: extra.rifaId != null ? Number(extra.rifaId) : null,
      valor: extra.valor != null ? Number(extra.valor) : null,
      source: attr.source,
      utmSource: attr.utmSource,
      utmCampaign: attr.utmCampaign,
      meta: extra.meta || null
    };
    setImmediate(() => {
      registrarEvento(payload).catch(() => {});
    });
  } catch (err) {
    console.error('[Analytics] trackFromRequest:', err.message);
  }
}

async function limparAntigos() {
  const cutoff = daysAgo(RETENTION_DAYS);
  const [pv, ev] = await Promise.all([
    prisma.pageView.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
  ]);
  if (pv.count > 0 || ev.count > 0) {
    console.log(`[Analytics] Removidos ${pv.count} pageviews e ${ev.count} eventos (>${RETENTION_DAYS}d)`);
  }
}

function labelFonte(source) {
  const s = String(source || 'direct').toLowerCase();
  const map = {
    direct: 'Link direto',
    google: 'Google / busca',
    social: 'Redes sociais',
    facebook: 'Facebook',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    tiktok: 'TikTok',
    twitter: 'X (Twitter)',
    linkedin: 'LinkedIn',
    cpc: 'Google Ads'
  };
  if (map[s]) return map[s];
  if (s.length <= 3) return s.toUpperCase();
  return s.replace(/\./g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function emptyTenantDashboard(periodo = 30) {
  return {
    periodo,
    resumo: { viewsPeriodo: 0, unicosPeriodo: 0, viewsHoje: 0, unicosHoje: 0 },
    topFontes: [],
    dispositivos: [],
    topCampanhas: [],
    visitasUltimos7Dias: []
  };
}

/** Agrupa pageviews por dia local em JS (compatível com DateTime Prisma/SQLite). */
function buildSerieFromRows(rows, periodo) {
  const map = new Map();
  for (const r of rows) {
    const key = localDateKey(r.createdAt);
    let slot = map.get(key);
    if (!slot) {
      slot = { views: 0, visitors: new Set() };
      map.set(key, slot);
    }
    slot.views += 1;
    if (r.visitorId) slot.visitors.add(r.visitorId);
  }

  const serie = [];
  for (let i = periodo - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = localDateKey(d);
    const slot = map.get(key);
    serie.push({
      dia: key,
      label: labelDia(key),
      views: slot ? slot.views : 0,
      unicos: slot ? slot.visitors.size : 0
    });
  }
  return serie;
}

async function obterDashboardTenant(tenantSlug, dias = 30) {
  const slug = String(tenantSlug || '').trim();
  if (!slug) return emptyTenantDashboard(dias);

  const periodo = Math.min(90, Math.max(7, parseInt(dias, 10) || 30));
  const since = daysAgo(periodo - 1);
  const hoje = startOfDay();
  const base = { createdAt: { gte: since }, tenantSlug: slug };

  const [
    viewsPeriodo,
    unicosPeriodo,
    viewsHoje,
    unicosHoje,
    serieRows,
    topFontes,
    dispositivos,
    topCampanhas
  ] = await Promise.all([
    prisma.pageView.count({ where: base }),
    prisma.pageView.groupBy({ by: ['visitorId'], where: base }).then((r) => r.length),
    prisma.pageView.count({ where: { ...base, createdAt: { gte: hoje } } }),
    prisma.pageView.groupBy({
      by: ['visitorId'],
      where: { ...base, createdAt: { gte: hoje } }
    }).then((r) => r.length),
    prisma.pageView.findMany({
      where: { ...base, createdAt: { gte: daysAgo(6) } },
      select: { createdAt: true, visitorId: true }
    }),
    prisma.pageView.groupBy({
      by: ['source'],
      where: { ...base, source: { not: null } },
      _count: { source: true }
    }).then((rows) => rows.sort((a, b) => b._count.source - a._count.source).slice(0, 8)),
    prisma.pageView.groupBy({
      by: ['device'],
      where: base,
      _count: { device: true }
    }),
    prisma.pageView.groupBy({
      by: ['utmCampaign'],
      where: { ...base, utmCampaign: { not: null } },
      _count: { utmCampaign: true }
    }).then((rows) => rows.sort((a, b) => b._count.utmCampaign - a._count.utmCampaign).slice(0, 5))
  ]);

  const visitasUltimos7Dias = buildSerieFromRows(serieRows, 7).map((s) => ({
    dia: new Date(s.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
    views: s.views,
    unicos: s.unicos
  }));

  const deviceTotal = dispositivos.reduce((acc, d) => acc + d._count.device, 0) || 1;
  const deviceLabels = { desktop: 'Desktop', mobile: 'Celular', tablet: 'Tablet' };
  const maxFonte = topFontes[0]?._count.source || 1;

  return {
    periodo,
    resumo: { viewsPeriodo, unicosPeriodo, viewsHoje, unicosHoje },
    topFontes: topFontes.map((f) => ({
      source: f.source || 'direct',
      label: labelFonte(f.source),
      views: f._count.source,
      pct: Math.round((f._count.source / maxFonte) * 100)
    })),
    dispositivos: dispositivos.map((d) => ({
      device: d.device,
      label: deviceLabels[d.device] || d.device,
      views: d._count.device,
      pct: Math.round((d._count.device / deviceTotal) * 100)
    })),
    topCampanhas: topCampanhas.map((c) => ({
      campaign: c.utmCampaign,
      views: c._count.utmCampaign
    })),
    visitasUltimos7Dias
  };
}

async function obterDashboard(dias = 7) {
  const periodo = Math.min(90, Math.max(1, parseInt(dias, 10) || 7));
  const since = daysAgo(periodo - 1);
  const hoje = startOfDay();
  const ontem = daysAgo(1);
  const pvWhere = { createdAt: { gte: since } };

  const [
    viewsPeriodo,
    unicosPeriodo,
    viewsHoje,
    unicosHoje,
    viewsOntem,
    serieRows,
    topPaginas,
    topFontes,
    topTenants,
    dispositivos,
    topCampanhas,
    topMedias,
    topRifas,
    viewsLanding,
    viewsLojas,
    cadastros,
    comprasPendentes,
    comprasPagas,
    receitaAgg,
    eventosRaw,
    kycAprovados
  ] = await Promise.all([
    prisma.pageView.count({ where: pvWhere }),
    prisma.pageView.groupBy({ by: ['visitorId'], where: pvWhere, _count: true }).then((r) => r.length),
    prisma.pageView.count({ where: { createdAt: { gte: hoje } } }),
    prisma.pageView.groupBy({ by: ['visitorId'], where: { createdAt: { gte: hoje } }, _count: true }).then((r) => r.length),
    prisma.pageView.count({ where: { createdAt: { gte: ontem, lt: hoje } } }),
    prisma.pageView.findMany({
      where: pvWhere,
      select: { createdAt: true, visitorId: true }
    }),
    prisma.pageView.groupBy({
      by: ['path'],
      where: pvWhere,
      _count: { path: true }
    }).then((rows) => rows.sort((a, b) => b._count.path - a._count.path).slice(0, 10)),
    prisma.pageView.groupBy({
      by: ['source'],
      where: { ...pvWhere, source: { not: null } },
      _count: { source: true }
    }).then((rows) => rows.sort((a, b) => b._count.source - a._count.source).slice(0, 8)),
    prisma.pageView.groupBy({
      by: ['tenantSlug'],
      where: { ...pvWhere, tenantSlug: { not: null } },
      _count: { tenantSlug: true }
    }).then((rows) => rows.sort((a, b) => b._count.tenantSlug - a._count.tenantSlug).slice(0, 8)),
    prisma.pageView.groupBy({
      by: ['device'],
      where: pvWhere,
      _count: { device: true }
    }),
    prisma.pageView.groupBy({
      by: ['utmCampaign'],
      where: { ...pvWhere, utmCampaign: { not: null } },
      _count: { utmCampaign: true }
    }).then((rows) => rows.sort((a, b) => b._count.utmCampaign - a._count.utmCampaign).slice(0, 8)),
    prisma.pageView.groupBy({
      by: ['utmMedium'],
      where: { ...pvWhere, utmMedium: { not: null } },
      _count: { utmMedium: true }
    }).then((rows) => rows.sort((a, b) => b._count.utmMedium - a._count.utmMedium).slice(0, 6)),
    prisma.pageView.groupBy({
      by: ['rifaId'],
      where: { ...pvWhere, rifaId: { not: null } },
      _count: { rifaId: true }
    }).then((rows) => rows.sort((a, b) => b._count.rifaId - a._count.rifaId).slice(0, 8)),
    prisma.pageView.count({ where: { ...pvWhere, tenantSlug: null } }),
    prisma.pageView.count({ where: { ...pvWhere, tenantSlug: { not: null } } }),
    prisma.organizador.count({ where: { createdAt: { gte: since } } }),
    prisma.reserva.count({ where: { createdAt: { gte: since }, statusPagamento: 'pendente' } }),
    prisma.reserva.count({ where: { createdAt: { gte: since }, statusPagamento: 'confirmado' } }),
    prisma.reserva.aggregate({
      where: { createdAt: { gte: since }, statusPagamento: 'confirmado' },
      _sum: { valorTotal: true }
    }),
    prisma.analyticsEvent.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: { event: true }
    }),
    prisma.organizador.count({
      where: { kycVerifiedAt: { gte: since }, kycStatus: 'aprovado' }
    })
  ]);

  const serie = buildSerieFromRows(serieRows, periodo);
  const maxViews = Math.max(1, ...serie.map((s) => s.views));

  const deviceTotal = dispositivos.reduce((acc, d) => acc + d._count.device, 0) || 1;
  const deviceLabels = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' };

  const variacaoViews = viewsOntem > 0
    ? Math.round(((viewsHoje - viewsOntem) / viewsOntem) * 100)
    : (viewsHoje > 0 ? 100 : 0);

  const receitaPeriodo = Number(receitaAgg._sum.valorTotal || 0);
  const ticketMedio = comprasPagas > 0 ? receitaPeriodo / comprasPagas : 0;
  const convVisitanteCompra = unicosPeriodo > 0
    ? Math.round((comprasPagas / unicosPeriodo) * 1000) / 10
    : 0;

  const rifaIds = topRifas.map((r) => r.rifaId).filter(Boolean);
  let rifaTitulos = {};
  if (rifaIds.length) {
    const rifas = await prisma.rifa.findMany({
      where: { id: { in: rifaIds } },
      select: { id: true, titulo: true, tenant: { select: { slug: true } } }
    });
    rifaTitulos = Object.fromEntries(rifas.map((r) => [r.id, { titulo: r.titulo, slug: r.tenant?.slug }]));
  }

  const eventosMap = Object.fromEntries(
    (eventosRaw || []).map((e) => [e.event, e._count.event])
  );

  const funil = [
    { key: 'views', label: 'Pageviews', value: viewsPeriodo },
    { key: 'unicos', label: 'Visitantes', value: unicosPeriodo },
    { key: 'pending', label: 'PIX gerados', value: comprasPendentes + comprasPagas },
    { key: 'paid', label: 'Compras pagas', value: comprasPagas },
    { key: 'signup', label: 'Cadastros', value: cadastros }
  ];
  const funilMax = Math.max(1, ...funil.map((f) => f.value));

  return {
    periodo,
    resumo: {
      viewsPeriodo,
      unicosPeriodo,
      viewsHoje,
      unicosHoje,
      viewsOntem,
      variacaoViews,
      mediaDia: Math.round(viewsPeriodo / periodo),
      viewsLanding,
      viewsLojas,
      cadastros,
      comprasPendentes,
      comprasPagas,
      receitaPeriodo,
      ticketMedio,
      convVisitanteCompra,
      kycAprovados
    },
    serie: serie.map((s) => ({
      ...s,
      pct: Math.round((s.views / maxViews) * 100)
    })),
    topPaginas: topPaginas.map((p) => ({ path: p.path, views: p._count.path })),
    topFontes: topFontes.map((f) => ({
      source: f.source || 'direct',
      label: labelFonte(f.source),
      views: f._count.source
    })),
    topTenants: topTenants.map((t) => ({ slug: t.tenantSlug, views: t._count.tenantSlug })),
    dispositivos: dispositivos.map((d) => ({
      device: d.device,
      label: deviceLabels[d.device] || d.device,
      views: d._count.device,
      pct: Math.round((d._count.device / deviceTotal) * 100)
    })),
    topCampanhas: topCampanhas.map((c) => ({
      campaign: c.utmCampaign,
      views: c._count.utmCampaign
    })),
    topMedias: topMedias.map((m) => ({
      medium: m.utmMedium,
      views: m._count.utmMedium
    })),
    topRifas: topRifas.map((r) => ({
      rifaId: r.rifaId,
      views: r._count.rifaId,
      titulo: rifaTitulos[r.rifaId]?.titulo || `Rifa #${r.rifaId}`,
      slug: rifaTitulos[r.rifaId]?.slug || null
    })),
    funil: funil.map((f) => ({
      ...f,
      pct: Math.round((f.value / funilMax) * 100)
    })),
    eventos: eventosMap
  };
}

module.exports = {
  RETENTION_DAYS,
  EVENTOS,
  labelFonte,
  registrar,
  registrarEvento,
  trackFromRequest,
  limparAntigos,
  obterDashboard,
  obterDashboardTenant
};
