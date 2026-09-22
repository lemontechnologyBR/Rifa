/**
 * Controller da plataforma SaaS — landing e cadastro.
 */
const TenantService = require('../services/tenantService');
const AuthService = require('../services/authService');
const GoogleAuthService = require('../services/googleAuthService');
const { slugify } = require('../lib/reservedSlugs');
const { platformLandingMeta, cadastroMeta, platformFaq } = require('../lib/seoMeta');
const KnowledgeBase = require('../lib/knowledgeBase');

const platformController = {
  landing(req, res) {
    const appUrl = res.locals.baseUrl || process.env.APP_URL || '';
    res.render('platform/landing', {
      titulo: 'VouRifar — Plataforma de Rifas Online',
      bodyClass: 'platform-landing',
      faqItems: platformFaq(),
      ...platformLandingMeta(appUrl)
    });
  },

  ajudaIndex(req, res) {
    const appUrl = res.locals.baseUrl || process.env.APP_URL || '';
    const audiencia = req.query.para === 'comprador' || req.query.para === 'organizador'
      ? req.query.para
      : null;
    const q = req.query.q || '';
    const artigos = KnowledgeBase.listarArtigos({ audiencia, q });
    res.render('platform/ajuda', {
      titulo: 'Central de Ajuda',
      bodyClass: 'platform-landing',
      platformLanding: true,
      categorias: KnowledgeBase.CATEGORIAS,
      artigos,
      filtroAudiencia: audiencia,
      busca: q,
      csrfToken: res.locals.csrfToken,
      ...KnowledgeBase.ajudaIndexMeta(appUrl)
    });
  },

  ajudaArtigo(req, res) {
    const appUrl = res.locals.baseUrl || process.env.APP_URL || '';
    const artigo = KnowledgeBase.buscarArtigo(req.params.slug);
    if (!artigo) {
      return res.status(404).render('platform/ajuda', {
        titulo: 'Central de Ajuda',
        bodyClass: 'platform-landing',
        platformLanding: true,
        categorias: KnowledgeBase.CATEGORIAS,
        artigos: KnowledgeBase.listarArtigos({}),
        filtroAudiencia: null,
        busca: '',
        erro: 'Artigo não encontrado. Veja os tópicos abaixo.',
        csrfToken: res.locals.csrfToken,
        ...KnowledgeBase.ajudaIndexMeta(appUrl)
      });
    }
    res.render('platform/ajuda-artigo', {
      titulo: artigo.titulo,
      bodyClass: 'platform-landing',
      platformLanding: true,
      artigo,
      relacionados: KnowledgeBase.artigosRelacionados(artigo),
      csrfToken: res.locals.csrfToken,
      ...KnowledgeBase.ajudaArtigoMeta(artigo, appUrl)
    });
  },

  acessarForm(req, res) {
    if (req.session.organizadorId && req.session.tenantSlug) {
      return res.redirect(`/${req.session.tenantSlug}/admin`);
    }

    res.render('platform/acessar', {
      titulo: 'Acessar painel',
      bodyClass: 'platform-landing',
      seoTitle: 'Entrar — VouRifar',
      seoDescription: 'Acesse o painel do seu sistema de rifas online VouRifar.',
      seoNoIndex: true,
      erro: req.query.erro ? decodeURIComponent(String(req.query.erro).replace(/\+/g, ' ')) : null,
      msg: req.query.msg ? decodeURIComponent(String(req.query.msg).replace(/\+/g, ' ')) : null,
      googleEnabled: GoogleAuthService.isConfigured(),
      csrfToken: res.locals.csrfToken
    });
  },

  async acessar(req, res) {
    const { email, senha } = req.body;

    try {
      const org = await AuthService.loginOrganizadorPorEmail(email, senha);
      if (!org) {
        return res.render('platform/acessar', {
          titulo: 'Acessar painel',
          bodyClass: 'platform-landing',
          erro: 'E-mail ou senha incorretos.',
          msg: null,
          googleEnabled: GoogleAuthService.isConfigured(),
          csrfToken: res.locals.csrfToken
        });
      }

      req.session.organizadorId = org.id;
      req.session.tenantId = org.tenantId;
      req.session.tenantSlug = org.tenant.slug;
      req.session.organizadorNome = org.nome;

      res.redirect(`/${org.tenant.slug}/admin`);
    } catch (err) {
      if (err.code === 'EMAIL_NAO_VERIFICADO') {
        return res.redirect(`/verificar-email?email=${encodeURIComponent(err.email || email || '')}`);
      }
      res.render('platform/acessar', {
        titulo: 'Acessar painel',
        bodyClass: 'platform-landing',
        erro: err.message,
        msg: null,
        googleEnabled: GoogleAuthService.isConfigured(),
        csrfToken: res.locals.csrfToken
      });
    }
  },

  verificarEmailForm(req, res) {
    res.render('platform/verificar-email', {
      titulo: 'Confirme seu e-mail',
      bodyClass: 'platform-landing',
      seoTitle: 'Confirmar e-mail — VouRifar',
      seoNoIndex: true,
      email: req.query.email || '',
      msg: req.query.msg ? decodeURIComponent(String(req.query.msg).replace(/\+/g, ' ')) : null,
      erro: req.query.erro ? decodeURIComponent(String(req.query.erro).replace(/\+/g, ' ')) : null,
      csrfToken: res.locals.csrfToken
    });
  },

  async confirmarEmail(req, res) {
    try {
      const org = await AuthService.confirmarEmailPorToken(req.query.token);
      req.session.organizadorId = org.id;
      req.session.tenantId = org.tenantId;
      req.session.tenantSlug = org.tenant.slug;
      req.session.organizadorNome = org.nome;

      setImmediate(async () => {
        try {
          const { enviarEmail } = require('../lib/emailService');
          const { templateBoasVindas } = require('../lib/emailTemplates');
          await enviarEmail({
            para: org.email,
            assunto: 'Bem-vindo à VouRifar!',
            html: templateBoasVindas({ organizador: org, tenantSlug: org.tenant.slug }),
            texto: `Olá ${org.nome}! Sua conta foi confirmada. Acesse ${process.env.APP_URL || 'https://vourifar.com.br'}/${org.tenant.slug}/admin`
          });
        } catch (e) {
          console.error('[Email] Falha boas-vindas pós-confirmação:', e.message);
        }
      });

      return res.redirect(`/${org.tenant.slug}/admin/rifas?nova=1&onboarding=1&msg=${encodeURIComponent('E-mail confirmado! Bem-vindo.')}`);
    } catch (err) {
      return res.redirect(`/verificar-email?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async reenviarConfirmacaoEmail(req, res) {
    const email = String(req.body.email || '').trim().toLowerCase();
    try {
      const result = await AuthService.reenviarConfirmacaoEmail(email);
      if (result?.jaVerificado) {
        return res.redirect(`/acessar?msg=${encodeURIComponent('E-mail já confirmado. Faça login.')}`);
      }
      if (result?.org) {
        const { enviarEmail } = require('../lib/emailService');
        const { templateConfirmacaoEmail } = require('../lib/emailTemplates');
        await enviarEmail({
          para: result.org.email,
          assunto: 'Confirme seu e-mail — VouRifar',
          html: templateConfirmacaoEmail({
            organizador: result.org,
            token: result.org.emailConfirmToken
          }),
          texto: `Confirme seu e-mail: ${process.env.APP_URL || 'https://vourifar.com.br'}/confirmar-email?token=${result.org.emailConfirmToken}`
        });
      }
      return res.redirect(`/verificar-email?email=${encodeURIComponent(email)}&msg=${encodeURIComponent('Se o e-mail existir, enviamos um novo link de confirmação.')}`);
    } catch (err) {
      return res.redirect(`/verificar-email?email=${encodeURIComponent(email)}&erro=${encodeURIComponent(err.message)}`);
    }
  },

  cadastroForm(req, res) {
    const googleProfile = req.session.googleCadastro;
    const viaGoogle = req.query.via === 'google' && googleProfile;

      const appUrl = res.locals.baseUrl || process.env.APP_URL || '';
      res.render('platform/cadastro', {
        titulo: 'Criar seu sistema de rifas',
        bodyClass: 'platform-landing',
        ...cadastroMeta(appUrl),
        erro: req.query.erro ? decodeURIComponent(String(req.query.erro).replace(/\+/g, ' ')) : null,
        dados: viaGoogle
          ? { nome: googleProfile.nome, email: googleProfile.email }
          : { email: req.query.email || '' },
        viaGoogle: !!viaGoogle,
        googleEnabled: GoogleAuthService.isConfigured(),
        baseUrl: res.locals.baseUrl,
        csrfToken: res.locals.csrfToken
      });
  },

  async cadastro(req, res) {
    const { nome_loja, slug, nome, email, senha, confirmar_senha, via_google, website } = req.body;
    const googleProfile = req.session.googleCadastro;
    const useGoogle = via_google === '1' && googleProfile;
    const dados = { nome_loja, slug, nome, email: useGoogle ? googleProfile.email : email };

    try {
      // Honeypot anti-bot — campo oculto deve ficar vazio
      if (website) {
        console.warn(`[Cadastro] honeypot preenchido ip=${req.ip}`);
        return res.redirect('/verificar-email?msg=' + encodeURIComponent('Se o e-mail for válido, enviaremos a confirmação.'));
      }

      if (useGoogle) {
        if (googleProfile.email !== String(email || '').toLowerCase()) {
          throw new Error('E-mail não confere com a conta Google.');
        }
      } else {
        if (senha !== confirmar_senha) throw new Error('Senhas não conferem.');
        if (!senha || senha.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres.');
      }

      const tenant = await TenantService.criar({
        nome: nome_loja,
        slug: slug || slugify(nome_loja)
      });

      const organizador = useGoogle
        ? await AuthService.registrarOrganizadorGoogle({
          tenantId: tenant.id,
          nome: nome || googleProfile.nome,
          email: googleProfile.email,
          googleId: googleProfile.googleId
        })
        : await AuthService.registrarOrganizador({
          tenantId: tenant.id,
          nome,
          email,
          senha
        });

      delete req.session.googleCadastro;

      try {
        const AnalyticsService = require('../services/analyticsService');
        AnalyticsService.trackFromRequest(req, res, AnalyticsService.EVENTOS.SIGNUP, {
          tenantSlug: tenant.slug,
          meta: { organizadorId: organizador.id }
        });
      } catch (_) {}

      if (useGoogle) {
        req.session.organizadorId = organizador.id;
        req.session.tenantId = tenant.id;
        req.session.tenantSlug = tenant.slug;
        req.session.organizadorNome = organizador.nome;

        setImmediate(async () => {
          try {
            const { enviarEmail } = require('../lib/emailService');
            const { templateBoasVindas } = require('../lib/emailTemplates');
            await enviarEmail({
              para: organizador.email,
              assunto: 'Bem-vindo à VouRifar!',
              html: templateBoasVindas({ organizador, tenantSlug: tenant.slug }),
              texto: `Olá ${organizador.nome}! Sua conta na VouRifar foi criada. Acesse ${process.env.APP_URL || 'https://vourifar.com.br'}/${tenant.slug}/admin`
            });
          } catch (e) {
            console.error('[Email] Falha ao enviar boas-vindas:', e.message);
          }
        });

        return res.redirect(`/${tenant.slug}/admin/rifas?nova=1&onboarding=1`);
      }

      // Cadastro por e-mail/senha: exige confirmação antes do login
      setImmediate(async () => {
        try {
          const { enviarEmail } = require('../lib/emailService');
          const { templateConfirmacaoEmail } = require('../lib/emailTemplates');
          await enviarEmail({
            para: organizador.email,
            assunto: 'Confirme seu e-mail — VouRifar',
            html: templateConfirmacaoEmail({
              organizador,
              token: organizador.emailConfirmToken
            }),
            texto: `Olá ${organizador.nome}! Confirme seu e-mail: ${process.env.APP_URL || 'https://vourifar.com.br'}/confirmar-email?token=${organizador.emailConfirmToken}`
          });
        } catch (e) {
          console.error('[Email] Falha ao enviar confirmação:', e.message);
        }
      });

      return res.redirect(`/verificar-email?email=${encodeURIComponent(organizador.email)}`);
    } catch (err) {
      const appUrl = res.locals.baseUrl || process.env.APP_URL || '';
      res.render('platform/cadastro', {
        titulo: 'Criar seu sistema de rifas',
        bodyClass: 'platform-landing',
        ...cadastroMeta(appUrl),
        erro: err.message,
        dados,
        viaGoogle: !!useGoogle,
        googleEnabled: GoogleAuthService.isConfigured(),
        baseUrl: res.locals.baseUrl,
        csrfToken: res.locals.csrfToken
      });
    }
  }
};

module.exports = platformController;
