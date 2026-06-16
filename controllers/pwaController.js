const path = require('path');
const fs = require('fs');
const { getBaseUrl } = require('../lib/requestUrl');
const { buildPlatformManifest, buildTenantManifest } = require('../lib/pwa');

function sendManifest(req, res, manifest) {
  res.set({
    'Content-Type': 'application/manifest+json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.json(manifest);
}

function platformManifest(req, res) {
  sendManifest(req, res, buildPlatformManifest(getBaseUrl(req)));
}

function tenantManifest(req, res) {
  sendManifest(req, res, buildTenantManifest(req.tenant, getBaseUrl(req)));
}

function serviceWorker(req, res) {
  res.set({
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Service-Worker-Allowed': '/'
  });
  res.sendFile(path.join(__dirname, '../public/sw.js'));
}

function audit(req, res) {
  const origin = getBaseUrl(req);
  const slug = req.tenant?.slug;
  const slugPath = slug ? `/${slug}/` : '/';
  const manifest = slug
    ? buildTenantManifest(req.tenant, origin)
    : buildPlatformManifest(origin);

  const iconChecks = manifest.icons.map((icon) => {
    let rel = icon.src;
    try {
      rel = new URL(icon.src).pathname;
    } catch (_) {
      rel = icon.src.replace(origin, '');
    }
    const filePath = path.join(__dirname, '../public', rel);
    let ok = false;
    let real = null;
    try {
      const buf = fs.readFileSync(filePath);
      if (buf.length > 24 && buf[0] === 0x89) {
        real = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
        ok = icon.sizes === real;
      }
    } catch (_) { /* ignore */ }
    return { src: icon.src, declared: icon.sizes, real, ok };
  });

  res.json({
    ok: iconChecks.every((i) => i.ok),
    origin,
    slug: slug || null,
    page: `${origin}${slugPath}`,
    manifestUrl: slug ? `${origin}/${slug}/manifest.webmanifest` : `${origin}/manifest.webmanifest`,
    swUrl: `${origin}/sw.js`,
    swScope: '/',
    manifest,
    iconChecks,
    tips: [
      'Use HTTPS (ngrok ou produção).',
      'Acesse sempre com barra final: /slug/',
      'Chrome só mostra instalar após interagir na página (clique/scroll).',
      'DevTools → Application → Clear site data se testou antes.',
      'Ngrok free: abra o site uma vez e clique em "Visit Site" antes do SW registrar.'
    ]
  });
}

module.exports = {
  platformManifest,
  tenantManifest,
  serviceWorker,
  audit
};
