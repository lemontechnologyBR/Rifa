const brand = require('./brand');

function withOrigin(origin, path) {
  const base = String(origin || '').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function buildIcons(origin) {
  return [
    {
      src: withOrigin(origin, '/img/pwa/icon-192.png'),
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: withOrigin(origin, '/img/pwa/icon-512.png'),
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    }
  ];
}

function buildPlatformManifest(origin) {
  const start = withOrigin(origin, '/');
  return {
    id: start,
    name: `${brand.PLATFORM_NAME} — Rifas online`,
    short_name: brand.PLATFORM_NAME,
    description: 'Plataforma justa para rifas online com pagamento PIX.',
    start_url: start,
    scope: start,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fafc',
    theme_color: brand.PLATFORM_COLOR,
    lang: 'pt-BR',
    prefer_related_applications: false,
    categories: ['business', 'finance'],
    icons: buildIcons(origin)
  };
}

function buildTenantManifest(tenant, origin) {
  const slugPath = `/${tenant.slug}/`;
  const start = withOrigin(origin, slugPath);
  const scope = withOrigin(origin, slugPath);
  const shortName = String(tenant.nome || brand.PLATFORM_NAME).trim().slice(0, 12);

  return {
    id: start,
    name: `${tenant.nome} — Rifas`,
    short_name: shortName,
    description: tenant.descricao || `Rifas online de ${tenant.nome}.`,
    start_url: start,
    scope,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fafc',
    theme_color: tenant.corPrimaria || brand.PLATFORM_COLOR,
    lang: 'pt-BR',
    prefer_related_applications: false,
    categories: ['shopping', 'finance'],
    icons: buildIcons(origin)
  };
}

module.exports = {
  buildPlatformManifest,
  buildTenantManifest,
  PWA_ICON_192: '/img/pwa/icon-192.png'
};
