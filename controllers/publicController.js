/**
 * Controller da área pública (scoped por tenant).
 */
const RifaService = require('../services/rifaService');
const NumeroService = require('../services/numeroService');
const ReservaService = require('../services/reservaService');
const CarrinhoService = require('../services/carrinhoService');
const { TEMPO_RESERVA_MIN, obterExpiraEmReserva } = require('../lib/reservaConfig');
const { anexarBrandingRifas, brandingEfetivo } = require('../lib/rifaBranding');
const { tenantIndexMeta, rifaDetalheMeta, truncate, tenantKeywords } = require('../lib/seoMeta');

const tenantLocals = (req) => ({
  tenant: req.tenant,
  tenantBase: `/${req.tenant.slug}`
});

const publicController = {
  async index(req, res) {
    if (!req.tenant) return res.redirect('/');

    const page = parseInt(req.query.page) || 1;
    const [{ rifas, total, paginas }, encerradasRes] = await Promise.all([
      RifaService.listar({ tenantId: req.tenant.id, status: 'ativa', page, limite: 9 }),
      RifaService.listar({ tenantId: req.tenant.id, status: 'finalizada', page: 1, limite: 5 })
    ]);
    const rifasComBrand = anexarBrandingRifas(rifas, req.tenant);
    const rifasEncerradas = encerradasRes.rifas || [];

    if (rifasComBrand.length === 1 && rifasComBrand[0].brand) {
      const r0 = rifasComBrand[0];
      const temCustom = r0.corPrimaria;
      if (temCustom) {
        res.locals.rifaBrand = r0.brand;
        res.locals.tenantCssVars = r0.brand.cssVars;
        res.locals.tenantCorDark = r0.brand.corDark;
      }
    }

    if (req.query.ajax === '1') {
      return res.json({ rifas: rifasComBrand, page, paginas, hasMore: page < paginas });
    }

    if (req.query.ref) req.session.codigoIndicacao = req.query.ref;

    const baseUrl = res.locals.baseUrl || '';

    res.render('public/index', {
      titulo: req.tenant.nome,
      ...tenantIndexMeta({ baseUrl, tenant: req.tenant }),
      rifas: rifasComBrand, page, paginas, total,
      rifasEncerradas,
      ...tenantLocals(req)
    });
  },

  async encerradas(req, res) {
    const page = parseInt(req.query.page) || 1;
    const { rifas, paginas } = await RifaService.listarEncerradas(req.tenant.id, page, 12);
    const baseUrl = res.locals.baseUrl || '';
    const pageUrl = `${baseUrl}/${req.tenant.slug}/encerradas`;
    res.render('public/encerradas', {
      titulo: 'Rifas Encerradas',
      seoTitle: `Rifas Encerradas — ${req.tenant.nome}`,
      seoDescription: truncate(`Confira rifas encerradas e ganhadores em ${req.tenant.nome}. Histórico de rifas online realizadas com transparência.`),
      seoKeywords: tenantKeywords(req.tenant.nome),
      seoUrl: pageUrl,
      seoImage: req.tenant.logoUrl || `${baseUrl}/img/vourifar-logo.png`,
      seoImageAlt: `Rifas encerradas — ${req.tenant.nome}`,
      rifas, page, paginas,
      ...tenantLocals(req)
    });
  },

  comoFunciona(req, res) {
    const baseUrl = res.locals.baseUrl || '';
    const pageUrl = `${baseUrl}/${req.tenant.slug}/como-funciona`;
    res.render('public/como-funciona', {
      titulo: 'Como funciona',
      seoTitle: `Como Funciona — Rifas Online ${req.tenant.nome}`,
      seoDescription: truncate(`Saiba como participar das rifas online de ${req.tenant.nome}. Escolha cotas, pague via PIX e acompanhe suas reservas.`),
      seoKeywords: tenantKeywords(req.tenant.nome),
      seoUrl: pageUrl,
      seoImage: req.tenant.logoUrl || `${baseUrl}/img/vourifar-logo.png`,
      seoImageAlt: `Como funciona — ${req.tenant.nome}`,
      ...tenantLocals(req)
    });
  },

  politicaPrivacidade(req, res) {
    const baseUrl = res.locals.baseUrl || '';
    const pageUrl = `${baseUrl}/${req.tenant.slug}/politica-privacidade`;
    res.render('public/politica-privacidade', {
      titulo: 'Política de privacidade',
      seoTitle: `Política de Privacidade — ${req.tenant.nome}`,
      seoDescription: truncate(`Política de privacidade e proteção de dados de ${req.tenant.nome} na plataforma VouRifar.`),
      seoUrl: pageUrl,
      seoNoIndex: true,
      ...tenantLocals(req)
    });
  },

  async detalhe(req, res) {
    const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
    if (!rifa) return res.status(404).render('public/404', { titulo: 'Rifa não encontrada' });

    const rifaBrand = brandingEfetivo(rifa, req.tenant);
    res.locals.tenantCssVars = rifaBrand.cssVars;
    res.locals.tenantCorDark = rifaBrand.corDark;
    res.locals.rifaBrand = rifaBrand;

    const numeros = await NumeroService.listarPorRifa(rifa.id);
    const stats = await RifaService.obterEstatisticas(rifa.id);
    const carrinhoNumeros = await CarrinhoService.restaurar(req.sessionID, rifa.id, null);

    const whatsappMsg = encodeURIComponent(
      `🎟️ Participe da rifa "${rifa.titulo}"! ${res.locals.baseUrl}/${req.tenant.slug}/rifas/${rifa.id}`
    );

    res.render('public/rifa-detalhe', {
      titulo: rifa.titulo,
      ...rifaDetalheMeta({ baseUrl: res.locals.baseUrl || '', tenant: req.tenant, rifa }),
      rifa, numeros, stats, carrinhoNumeros,
      comentarios: rifa.comentarios,
      whatsappMsg,
      codigoIndicacao: req.session.codigoIndicacao || '',
      csrfToken: res.locals.csrfToken,
      tempoReservaMin: TEMPO_RESERVA_MIN,
      ...tenantLocals(req)
    });
  },

  async resultado(req, res) {
    const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
    if (!rifa) return res.status(404).render('public/404', { titulo: 'Rifa não encontrada' });

    const rifaBrand = brandingEfetivo(rifa, req.tenant);
    res.locals.tenantCssVars = rifaBrand.cssVars;
    res.locals.tenantCorDark = rifaBrand.corDark;
    res.locals.rifaBrand = rifaBrand;
    if (rifa.status !== 'finalizada') return res.redirect(`/${req.tenant.slug}/rifas/${rifa.id}`);

    const baseUrl = res.locals.baseUrl || '';
    const pageUrl = `${baseUrl}/${req.tenant.slug}/rifas/${rifa.id}/resultado`;
    res.render('public/sorteio-resultado', {
      titulo: `Resultado — ${rifa.titulo}`,
      seoTitle: `Resultado — ${rifa.titulo} | ${req.tenant.nome}`,
      seoDescription: truncate(`Resultado da rifa ${rifa.titulo} em ${req.tenant.nome}. Confira o número sorteado e o ganhador.`),
      seoUrl: pageUrl,
      seoImage: rifa.imagemUrl || req.tenant.logoUrl || `${baseUrl}/img/vourifar-logo.png`,
      seoImageAlt: `Resultado — ${rifa.titulo}`,
      rifa,
      ...tenantLocals(req)
    });
  },

  minhasReservas(req, res) {
    res.render('public/minhas-reservas', {
      titulo: 'Minhas Reservas',
      seoNoIndex: true,
      resultado: null, cpf: '', erro: null, csrfToken: res.locals.csrfToken,
      ...tenantLocals(req)
    });
  },

  async buscarReservas(req, res) {
    try {
      const resultado = await ReservaService.buscarPorCpf(req.body.cpf, req.tenant.id);
      res.render('public/minhas-reservas', {
        titulo: 'Minhas Reservas', resultado, cpf: req.body.cpf, erro: null, csrfToken: res.locals.csrfToken,
        ...tenantLocals(req)
      });
    } catch (err) {
      res.render('public/minhas-reservas', {
        titulo: 'Minhas Reservas', resultado: null, cpf: req.body.cpf || '', erro: err.message, csrfToken: res.locals.csrfToken,
        ...tenantLocals(req)
      });
    }
  },

  async comprovante(req, res) {
    const reserva = await ReservaService.buscarPorId(req.params.id, req.tenant.id);
    if (!reserva) return res.status(404).render('public/404', { titulo: 'Comprovante não encontrado' });

    const pagamento = ReservaService.montarPagamentoPix(reserva, reserva.rifa);
    res.render('public/comprovante', {
      titulo: `Comprovante #${reserva.id}`,
      seoNoIndex: true,
      reserva, pagamento,
      tempoReservaMin: TEMPO_RESERVA_MIN,
      reservaExpiraEm: obterExpiraEmReserva(reserva).toISOString(),
      ...tenantLocals(req)
    });
  }
};

module.exports = publicController;
