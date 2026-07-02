/**
 * Registro e agregação de pageviews para o Super Admin.
 */
const prisma = require('../lib/prisma');

const RETENTION_DAYS = 90;

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

function labelDia(iso) {
  const [y, m, day] = String(iso).split('-');
  return `${day}/${m}`;
}

async function registrar(data) {
  await prisma.pageView.create({ data });
}

async function limparAntigos() {
  const cutoff = daysAgo(RETENTION_DAYS);
  const result = await prisma.pageView.deleteMany({
    where: { createdAt: { lt: cutoff } }
  });
  if (result.count > 0) {
    console.log(`[Analytics] Removidos ${result.count} pageviews com mais de ${RETENTION_DAYS} dias`);
  }
}

async function obterDashboard(dias = 7) {
  const periodo = Math.min(90, Math.max(1, parseInt(dias, 10) || 7));
  const since = daysAgo(periodo - 1);
  const hoje = startOfDay();
  const ontem = daysAgo(1);

  const [
    viewsPeriodo,
    unicosPeriodo,
    viewsHoje,
    unicosHoje,
    viewsOntem,
    serieRaw,
    topPaginas,
    topFontes,
    topTenants,
    dispositivos
  ] = await Promise.all([
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
    prisma.pageView.groupBy({
      by: ['visitorId'],
      where: { createdAt: { gte: since } },
      _count: true
    }).then((r) => r.length),
    prisma.pageView.count({ where: { createdAt: { gte: hoje } } }),
    prisma.pageView.groupBy({
      by: ['visitorId'],
      where: { createdAt: { gte: hoje } },
      _count: true
    }).then((r) => r.length),
    prisma.pageView.count({
      where: { createdAt: { gte: ontem, lt: hoje } }
    }),
    prisma.$queryRaw`
      SELECT date(created_at) as dia, COUNT(*) as views, COUNT(DISTINCT visitor_id) as unicos
      FROM page_views
      WHERE created_at >= ${since}
      GROUP BY date(created_at)
      ORDER BY dia ASC
    `,
    prisma.pageView.groupBy({
      by: ['path'],
      where: { createdAt: { gte: since } },
      _count: { path: true }
    }).then((rows) => rows.sort((a, b) => b._count.path - a._count.path).slice(0, 10)),
    prisma.pageView.groupBy({
      by: ['source'],
      where: { createdAt: { gte: since }, source: { not: null } },
      _count: { source: true }
    }).then((rows) => rows.sort((a, b) => b._count.source - a._count.source).slice(0, 8)),
    prisma.pageView.groupBy({
      by: ['tenantSlug'],
      where: { createdAt: { gte: since }, tenantSlug: { not: null } },
      _count: { tenantSlug: true }
    }).then((rows) => rows.sort((a, b) => b._count.tenantSlug - a._count.tenantSlug).slice(0, 8)),
    prisma.pageView.groupBy({
      by: ['device'],
      where: { createdAt: { gte: since } },
      _count: { device: true }
    })
  ]);

  const serieMap = new Map(
    (serieRaw || []).map((r) => [String(r.dia), { views: Number(r.views), unicos: Number(r.unicos) }])
  );

  const serie = [];
  for (let i = periodo - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    const row = serieMap.get(key) || { views: 0, unicos: 0 };
    serie.push({
      dia: key,
      label: labelDia(key),
      views: row.views,
      unicos: row.unicos
    });
  }

  const maxViews = Math.max(1, ...serie.map((s) => s.views));

  const deviceTotal = dispositivos.reduce((acc, d) => acc + d._count.device, 0) || 1;
  const deviceLabels = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' };

  const variacaoViews = viewsOntem > 0
    ? Math.round(((viewsHoje - viewsOntem) / viewsOntem) * 100)
    : (viewsHoje > 0 ? 100 : 0);

  return {
    periodo,
    resumo: {
      viewsPeriodo,
      unicosPeriodo,
      viewsHoje,
      unicosHoje,
      viewsOntem,
      variacaoViews,
      mediaDia: Math.round(viewsPeriodo / periodo)
    },
    serie: serie.map((s) => ({
      ...s,
      pct: Math.round((s.views / maxViews) * 100)
    })),
    topPaginas: topPaginas.map((p) => ({
      path: p.path,
      views: p._count.path
    })),
    topFontes: topFontes.map((f) => ({
      source: f.source || 'direct',
      views: f._count.source
    })),
    topTenants: topTenants.map((t) => ({
      slug: t.tenantSlug,
      views: t._count.tenantSlug
    })),
    dispositivos: dispositivos.map((d) => ({
      device: d.device,
      label: deviceLabels[d.device] || d.device,
      views: d._count.device,
      pct: Math.round((d._count.device / deviceTotal) * 100)
    }))
  };
}

module.exports = {
  RETENTION_DAYS,
  registrar,
  limparAntigos,
  obterDashboard
};
