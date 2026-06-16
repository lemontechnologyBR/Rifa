/**
 * Controller — OAuth Google para organizadores (criadores).
 */
const prisma = require('../lib/prisma');
const GoogleAuthService = require('../services/googleAuthService');
const AuthService = require('../services/authService');

function sessaoOrganizador(req, org) {
  req.session.organizadorId = org.id;
  req.session.tenantId = org.tenantId;
  req.session.tenantSlug = org.tenant.slug;
  req.session.organizadorNome = org.nome;
}

const googleAuthController = {
  iniciarAcessar(req, res) {
    if (!GoogleAuthService.isConfigured()) {
      return res.redirect('/acessar?erro=Login+Google+não+configurado.');
    }

    const state = GoogleAuthService.encodeState({ mode: 'acessar' });
    res.redirect(GoogleAuthService.buildAuthUrl(req, state));
  },

  iniciarCadastro(req, res) {
    if (!GoogleAuthService.isConfigured()) {
      return res.redirect('/cadastro?erro=Login+Google+não+configurado.+Use+e-mail+e+senha.');
    }

    const state = GoogleAuthService.encodeState({ mode: 'cadastro' });
    res.redirect(GoogleAuthService.buildAuthUrl(req, state));
  },

  iniciarLoginTenant(req, res) {
    if (!GoogleAuthService.isConfigured()) {
      return res.redirect(`/${req.tenant.slug}/admin/login?erro=Login+Google+não+configurado.`);
    }

    const state = GoogleAuthService.encodeState({
      mode: 'login',
      tenantSlug: req.tenant.slug
    });
    res.redirect(GoogleAuthService.buildAuthUrl(req, state));
  },

  async callback(req, res) {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect('/acessar?erro=Login+Google+cancelado.');
    }

    if (!code || !state) {
      return res.status(400).send('Sessão OAuth inválida. Tente novamente.');
    }

    let payload;
    try {
      payload = GoogleAuthService.verifyState(state);
    } catch (_) {
      return res.status(400).send('Sessão OAuth inválida. Tente novamente.');
    }

    try {
      const profile = await GoogleAuthService.exchangeCode(req, code);

      if (payload.mode === 'acessar') {
        const org = await AuthService.loginOrganizadorGoogleGlobal({
          googleId: profile.googleId,
          email: profile.email,
          nome: profile.nome
        });

        if (!org) {
          return res.redirect(
            `/acessar?erro=${encodeURIComponent('Conta Google não encontrada. Cadastre seu sistema primeiro.')}`
          );
        }

        sessaoOrganizador(req, org);
        return res.redirect(`/${org.tenant.slug}/admin`);
      }

      if (payload.mode === 'login') {
        const tenant = await prisma.tenant.findUnique({ where: { slug: payload.tenantSlug } });
        if (!tenant) return res.status(404).send('Sistema de rifas não encontrado.');

        const org = await AuthService.loginOrganizadorGoogle({
          googleId: profile.googleId,
          email: profile.email,
          tenantId: tenant.id,
          nome: profile.nome
        });

        if (!org) {
          return res.redirect(
            `/${payload.tenantSlug}/admin/login?erro=${encodeURIComponent('Conta Google não vinculada a este sistema. Cadastre-se ou use e-mail e senha.')}`
          );
        }

        sessaoOrganizador(req, org);
        return res.redirect(`/${org.tenant.slug}/admin`);
      }

      if (payload.mode === 'cadastro') {
        const existente = await prisma.organizador.findUnique({
          where: { email: profile.email },
          include: { tenant: true }
        });

        if (existente) {
          if (existente.tenant.status === 'suspenso') {
            return res.redirect('/cadastro?erro=Este+sistema+está+suspenso.');
          }

          const org = await AuthService.loginOrganizadorGoogle({
            googleId: profile.googleId,
            email: profile.email,
            tenantId: existente.tenantId,
            nome: profile.nome
          });
          sessaoOrganizador(req, org);
          return res.redirect(`/${org.tenant.slug}/admin?msg=${encodeURIComponent('Você já possui um sistema. Bem-vindo de volta!')}`);
        }

        req.session.googleCadastro = profile;
        return res.redirect('/cadastro?via=google');
      }

      return res.status(400).send('Fluxo OAuth inválido.');
    } catch (err) {
      console.error('Google OAuth:', err);
      let redirect = '/cadastro';
      if (payload.mode === 'acessar' || payload.mode === 'login') redirect = '/acessar';
      return res.redirect(`${redirect}?erro=${encodeURIComponent(err.message)}`);
    }
  }
};

module.exports = googleAuthController;
