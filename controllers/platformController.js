/**
 * Controller da plataforma SaaS — landing e cadastro.
 */
const TenantService = require('../services/tenantService');
const AuthService = require('../services/authService');
const GoogleAuthService = require('../services/googleAuthService');
const { slugify } = require('../lib/reservedSlugs');

const platformController = {
  landing(req, res) {
    const appUrl = res.locals.baseUrl || process.env.APP_URL || '';
    res.render('platform/landing', {
      titulo: 'VouRifar — Rifas Online',
      seoTitle: 'VouRifar — Crie seu Sistema de Rifas Online com PIX',
      seoDescription: 'Crie sua própria plataforma de rifas online com pagamento via PIX. Gratuito para começar — comissão de 10% sobre o arrecadado. Você recebe 90% de cada venda. Cadastre-se agora!',
      seoUrl: appUrl + '/',
      seoType: 'website',
      seoImage: appUrl + '/img/vourifar-logo.png',
      seoJsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            name: 'VouRifar',
            url: appUrl,
            logo: appUrl + '/img/vourifar-logo.png',
            description: 'Plataforma SaaS de rifas online com pagamento via PIX'
          },
          {
            '@type': 'WebSite',
            name: 'VouRifar',
            url: appUrl,
            potentialAction: {
              '@type': 'SearchAction',
              target: appUrl + '/busca?q={search_term_string}',
              'query-input': 'required name=search_term_string'
            }
          },
          {
            '@type': 'SoftwareApplication',
            name: 'VouRifar',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'BRL',
              description: 'Gratuito para o organizador'
            }
          }
        ]
      }
    });
  },

  acessarForm(req, res) {
    if (req.session.organizadorId && req.session.tenantSlug) {
      return res.redirect(`/${req.session.tenantSlug}/admin`);
    }

    res.render('platform/acessar', {
      titulo: 'Acessar painel',
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
      res.render('platform/acessar', {
        titulo: 'Acessar painel',
        erro: err.message,
        msg: null,
        googleEnabled: GoogleAuthService.isConfigured(),
        csrfToken: res.locals.csrfToken
      });
    }
  },

  cadastroForm(req, res) {
    const googleProfile = req.session.googleCadastro;
    const viaGoogle = req.query.via === 'google' && googleProfile;

      res.render('platform/cadastro', {
        titulo: 'Criar seu sistema de rifas',
        seoTitle: 'Criar Sistema de Rifas Grátis — VouRifar',
        seoDescription: 'Cadastre-se gratuitamente e crie seu sistema de rifas online em minutos. Pagamento via PIX, sorteio automático.',
        seoNoIndex: false,
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
    const { nome_loja, slug, nome, email, senha, confirmar_senha, via_google } = req.body;
    const googleProfile = req.session.googleCadastro;
    const useGoogle = via_google === '1' && googleProfile;
    const dados = { nome_loja, slug, nome, email: useGoogle ? googleProfile.email : email };

    try {
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

      req.session.organizadorId = organizador.id;
      req.session.tenantId = tenant.id;
      req.session.tenantSlug = tenant.slug;
      req.session.organizadorNome = organizador.nome;

      res.redirect(`/${tenant.slug}/admin/carteira?onboarding=1`);
    } catch (err) {
      res.render('platform/cadastro', {
        titulo: 'Criar seu sistema de rifas',
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
