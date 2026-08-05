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
    linkedin: 'LinkedIn'
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
    serieRaw,
    topFontes,
    dispositivos,
    topCampanhas
  ] = await Promise.all([
    prisma.pageView.count({ where: base }),
    prisma.pageView.groupBy({
      by: ['visitorId'],
      where: base
    }).then((r) => r.length),
    prisma.pageView.count({ where: { ...base, createdAt: { gte: hoje } } }),
    prisma.pageView.groupBy({
      by: ['visitorId'],
      where: { ...base, createdAt: { gte: hoje } }
    }).then((r) => r.length),
    prisma.$queryRaw`
      SELECT date(created_at) as dia, COUNT(*) as views, COUNT(DISTINCT visitor_id) as unicos
      FROM page_views
      WHERE created_at >= ${since} AND tenant_slug = ${slug}
      GROUP BY date(created_at)
      ORDER BY dia ASC
    `,
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

  const serieMap = new Map(
    (serieRaw || []).map((r) => [String(r.dia), { views: Number(r.views), unicos: Number(r.unicos) }])
  );

  const visitasUltimos7Dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    const row = serieMap.get(key) || { views: 0, unicos: 0 };
    visitasUltimos7Dias.push({
      dia: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
      views: row.views,
      unicos: row.unicos
    });
  }

  const deviceTotal = dispositivos.reduce((acc, d) => acc + d._count.device, 0) || 1;
  const deviceLabels = { desktop: 'Desktop', mobile: 'Celular', tablet: 'Tablet' };
  const maxFonte = topFontes[0]?._count.source || 1;

  return {
    periodo,
    resumo: {
      viewsPeriodo,
      unicosPeriodo,
      viewsHoje,
      unicosHoje
    },
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
  labelFonte,
  registrar,
  limparAntigos,
  obterDashboard,
  obterDashboardTenant
};
