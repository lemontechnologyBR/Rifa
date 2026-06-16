/**
 * Auditoria PWA — manifest, SW, ícones e HTML por tenant.
 * Uso: node scripts/audit-pwa.js [baseUrl] [slug...]
 */
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const slugs = process.argv.slice(3).length ? process.argv.slice(3) : ['demo', 'rifadaju'];

function pngSize(buf) {
  if (buf.length < 24 || buf[0] !== 0x89) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function auditSlug(slug) {
  const lines = [`\n=== /${slug}/ ===`];
  let ok = true;

  const noSlash = await fetch(`${base}/${slug}`, { redirect: 'manual' });
  lines.push(`redirect /${slug} -> ${noSlash.status} ${noSlash.headers.get('location') || ''}`);
  if (noSlash.status !== 301 && noSlash.status !== 308) ok = false;

  const pageRes = await fetch(`${base}/${slug}/`);
  const html = await pageRes.text();
  lines.push(`page ${pageRes.status} ${pageRes.headers.get('content-type')}`);

  const manifestHref = html.match(/rel="manifest"\s+href="([^"]+)"/)?.[1]
    || html.match(/href="([^"]+)"\s+rel="manifest"/)?.[1];
  lines.push(`manifest href: ${manifestHref || 'AUSENTE'}`);
  if (!manifestHref) ok = false;

  const swBlock = html.match(/serviceWorker\.register\([\s\S]*?\)/)?.[0];
  lines.push(`sw register: ${swBlock || 'AUSENTE'}`);
  if (!swBlock) ok = false;

  const manifestRes = await fetch(`${base}/${slug}/manifest.webmanifest`);
  lines.push(`manifest GET ${manifestRes.status} ${manifestRes.headers.get('content-type')}`);
  if (!manifestRes.ok) {
    ok = false;
    return { slug, ok, lines };
  }

  const manifest = await manifestRes.json();
  lines.push(`name: ${manifest.name}`);
  lines.push(`scope: ${manifest.scope} | start_url: ${manifest.start_url} | id: ${manifest.id}`);

  const swRes = await fetch(`${base}/sw.js`);
  lines.push(`sw.js ${swRes.status} allowed=${swRes.headers.get('service-worker-allowed')} type=${swRes.headers.get('content-type')}`);
  const swBody = await swRes.text();
  if (swBody.trim().startsWith('<')) {
    lines.push('ERRO: sw.js retornou HTML (ngrok/interstitial?)');
    ok = false;
  }

  for (const icon of manifest.icons || []) {
    const iconUrl = icon.src.startsWith('http') ? icon.src : `${base}${icon.src}`;
    const ir = await fetch(iconUrl);
    const buf = Buffer.from(await ir.arrayBuffer());
    const dim = pngSize(buf);
    const dimStr = dim ? `${dim.w}x${dim.h}` : 'n/a';
    const match = icon.sizes === 'any' || dimStr === icon.sizes;
    lines.push(`icon ${icon.src} [${icon.purpose}] decl=${icon.sizes} real=${dimStr} http=${ir.status} ${match ? 'OK' : 'TAMANHO ERRADO'}`);
    if (!match && icon.purpose === 'any') ok = false;
  }

  lines.push(ok ? 'RESULTADO: OK' : 'RESULTADO: FALHOU');
  return { slug, ok, lines };
}

(async () => {
  console.log('Base:', base);
  for (const slug of slugs) {
    const r = await auditSlug(slug);
    r.lines.forEach((l) => console.log(l));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
