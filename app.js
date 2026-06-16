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
const tenantRoutes = require('./routes/tenant');
const pwaController = require('./controllers/pwaController');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:', 'https://chart.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
      connectSrc: ["'self'", 'https://cdn.tailwindcss.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
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

app.use(csrfToken);
app.use(carregarUsuario);
app.use(validarCSRF);

// Rotas fixas antes do slug dinâmico
app.use('/auth', authGoogleRoutes);
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
  const { TEMPO_RESERVA_MIN } = require('./lib/reservaConfig');
  setInterval(() => {
    ReservaService.limparExpiradas().catch((err) => console.error('Limpeza reservas expiradas:', err.message));
  }, 60 * 1000);

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
