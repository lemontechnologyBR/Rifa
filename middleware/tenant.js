/**
 * Middleware multi-tenant — resolve slug e autentica organizador.
 */
const prisma = require('../lib/prisma');
const brand = require('../lib/brand');
const { isSlugReservado } = require('../lib/reservedSlugs');
const { cssVars, darkenHex } = require('../lib/tenantBranding');

async function resolveTenant(req, res, next) {
  const slug = (req.params.slug || '').toLowerCase();
  if (!slug || isSlugReservado(slug)) {
    return res.status(404).render('public/404', { titulo: 'Sistema de rifas não encontrado' });
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status === 'suspenso') {
      return res.status(404).render('public/404', { titulo: 'Sistema de rifas não encontrado' });
    }

    req.tenant = tenant;
    res.locals.tenant = tenant;
    res.locals.tenantCssVars = cssVars(tenant);
    res.locals.tenantCorDark = darkenHex(tenant.corPrimaria || '#10b981');
    res.locals.tenantBase = `/${tenant.slug}`;
    res.locals.adminBase = `/${tenant.slug}/admin`;
    res.locals.apiBase = `/${tenant.slug}/api`;
    res.locals.pwaManifestUrl = `/${tenant.slug}/manifest.webmanifest`;
    res.locals.pwaSwUrl = '/sw.js';
    res.locals.pwaScope = '/';
    res.locals.pwaIconUrl = '/img/pwa/icon-192.png';
    res.locals.pwaShortName = String(tenant.nome || 'Rifas').trim().slice(0, 12);

    const organizador = await prisma.organizador.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
      select: { nome: true }
    });
    res.locals.organizadorNome = organizador?.nome || tenant.nome;

    next();
  } catch (err) {
    next(err);
  }
}

function requireOrganizador(req, res, next) {
  if (
    req.session?.organizadorId &&
    req.session?.tenantId === req.tenant?.id
  ) {
    res.locals.organizadorLogado = true;
    return next();
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ erro: 'Faça login como organizador.' });
  }
  return res.redirect(`/${req.tenant.slug}/admin/login`);
}

function carregarOrganizador(req, res, next) {
  res.locals.organizadorLogado = !!(
    req.session?.organizadorId && req.session?.tenantId === req.tenant?.id
  );
  next();
}

module.exports = { resolveTenant, requireOrganizador, carregarOrganizador };
