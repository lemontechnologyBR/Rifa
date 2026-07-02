/**
 * Aplicação principal — VouRifar SaaS Multi-tenant
 */
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');

const AuthService = require('./services/authService');
const { carregarUsuario } = require('./middleware/auth');
const { csrfToken, validarCSRF } = require('./middleware/csrf');

const platformRoutes = require('./routes/platform');
const superAdminRoutes = require('./routes/superAdmin');
const authGoogleRoutes = require('./routes/authGoogle');
const authMercadoPagoRoutes = require('./routes/authMercadoPago');
const tenantRoutes = require('./routes/tenant');
const pwaController = require('./controllers/pwaController');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const GOOGLE_ADS_CSP = {
  script: [
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://googleads.g.doubleclick.net'
  ],
  connect: [
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://analytics.google.com',
    'https://region1.google-analytics.com',
    'https://googleads.g.doubleclick.net',
    'https://stats.g.doubleclick.net',
    'https://www.google.com'
  ],
  img: [
    'https://googleads.g.doubleclick.net',
    'https://www.google.com',
    'https://www.googletagmanager.com'
  ],
  frame: [
    'https://www.googletagmanager.com',
    'https://td.doubleclick.net'
  ],
  style: [
    'https://www.googletagmanager.com'
  ]
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net', ...GOOGLE_ADS_CSP.script],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', ...GOOGLE_ADS_CSP.style],
      imgSrc: ["'self'", 'data:', 'https:', 'http:', 'https://chart.googleapis.com', ...GOOGLE_ADS_CSP.img],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
      connectSrc: ["'self'", 'https://cdn.tailwindcss.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net', ...GOOGLE_ADS_CSP.connect],
      frameSrc: ["'self'", ...GOOGLE_ADS_CSP.frame],
      workerSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/manifest.webmanifest', pwaController.platformManifest);
app.get('/sw.js', pwaController.serviceWorker);
app.get('/pwa-check', pwaController.audit);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, uptime: Math.floor(process.uptime()) });
});

app.get('/robots.txt', (req, res) => {
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\n\nDisallow: /super/\nDisallow: /*/admin/\nDisallow: /api/\nDisallow: /webhooks/\nDisallow: /health\nDisallow: /pwa-check\n\nSitemap: ${appUrl}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', async (req, res) => {
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const prisma = require('./lib/prisma');
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ativo' },
      select: { slug: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });
    const rifas = await prisma.rifa.findMany({
      where: { status: { in: ['ativa', 'finalizada'] } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        tenant: { select: { slug: true, status: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    const now = new Date().toISOString().split('T')[0];
    const urls = [
      `<url><loc>${appUrl}/</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${appUrl}/cadastro</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`,
      `<url><loc>${appUrl}/acessar</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    ];

    for (const t of tenants) {
      const d = t.createdAt ? t.createdAt.toISOString().split('T')[0] : now;
      urls.push(`<url><loc>${appUrl}/${t.slug}/</loc><lastmod>${d}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`);
      urls.push(`<url><loc>${appUrl}/${t.slug}/encerradas</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.4</priority></url>`);
    }

    for (const r of rifas) {
      if (!r.tenant || r.tenant.status !== 'ativo') continue;
      const d = r.createdAt ? r.createdAt.toISOString().split('T')[0] : now;
      const prio = r.status === 'ativa' ? '0.9' : '0.5';
      const freq = r.status === 'ativa' ? 'daily' : 'monthly';
      urls.push(`<url><loc>${appUrl}/${r.tenant.slug}/rifas/${r.id}</loc><lastmod>${d}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`);
    }

    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  } catch (err) {
    res.status(500).type('text/plain').send('Erro ao gerar sitemap.');
  }
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'rifas-dev-secret-change-me',
  resave: false,
  saveUninitialized: true,
  proxy: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true'
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const { getBaseUrl } = require('./lib/requestUrl');
const brand = require('./lib/brand');
app.use((req, res, next) => {
  res.locals.baseUrl = getBaseUrl(req);
  res.locals.platformName = brand.PLATFORM_NAME;
  res.locals.platformLogo = brand.PLATFORM_LOGO;
  res.locals.platformFavicon = brand.PLATFORM_FAVICON;
  res.locals.platformColor = brand.PLATFORM_COLOR;
  res.locals.pwaEnabled = true;
  res.locals.pwaManifestUrl = '/manifest.webmanifest';
  res.locals.pwaSwUrl = '/sw.js';
  res.locals.pwaScope = '/';
  res.locals.pwaIconUrl = '/img/pwa/icon-192.png';
  res.locals.pwaShortName = brand.PLATFORM_NAME;
  next();
});

app.use(async (req, res, next) => {
  const isAdminArea = req.path.startsWith('/super') || /\/admin(\/|$)/.test(req.path);
  if (isAdminArea) {
    res.locals.googleAdsTagId = '';
    return next();
  }
  try {
    const PlatformSettingsService = require('./services/platformSettingsService');
    res.locals.googleAdsTagId = await PlatformSettingsService.getActiveGoogleAdsTagId();
  } catch (err) {
    console.error('[Marketing] Erro ao carregar tag Google Ads:', err.message);
    res.locals.googleAdsTagId = '';
  }
  next();
});

app.use(csrfToken);
app.use(carregarUsuario);
app.use(validarCSRF);
app.use(require('./middleware/trackPageView'));

// Páginas de admin/super são noindex
app.use(['/super', '/:slug/admin'], (req, res, next) => {
  res.locals.seoNoIndex = true;
  next();
});

// Rotas fixas antes do slug dinâmico
app.use('/auth', authGoogleRoutes);
app.use('/auth', authMercadoPagoRoutes);
app.use('/', platformRoutes);
app.use('/super', superAdminRoutes);
app.use('/:slug', tenantRoutes);

app.use((req, res) => {
  res.status(404).render('public/404', { titulo: 'Página não encontrada' });
});

app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).send('Erro interno do servidor.');
});

async function bootstrap() {
  await AuthService.garantirAdminPadrao();

  const ReservaService = require('./services/reservaService');
  const AnalyticsService = require('./services/analyticsService');
  const { TEMPO_RESERVA_MIN } = require('./lib/reservaConfig');
  setInterval(() => {
    ReservaService.limparExpiradas().catch((err) => console.error('Limpeza reservas expiradas:', err.message));
  }, 60 * 1000);

  require('./jobs/syncPagamentos').iniciar();
  require('./jobs/syncSaques').iniciar();

  AnalyticsService.limparAntigos().catch((err) => console.error('[Analytics] Limpeza:', err.message));
  setInterval(() => {
    AnalyticsService.limparAntigos().catch((err) => console.error('[Analytics] Limpeza:', err.message));
  }, 24 * 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log('');
    console.log('VouRifar — Plataforma de Rifas');
    console.log(`Reservas/PIX expiram em ${TEMPO_RESERVA_MIN} min`);
    console.log(`Plataforma:  http://localhost:${PORT}`);
    console.log(`Demo loja:   http://localhost:${PORT}/demo`);
    console.log(`Super Admin: http://localhost:${PORT}/super (admin / admin123)`);
    console.log('');
  });
}

bootstrap().catch(console.error);

module.exports = app;
