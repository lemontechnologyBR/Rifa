/**
 * Controller da área pública (scoped por tenant).
 */
const RifaService = require('../services/rifaService');
const NumeroService = require('../services/numeroService');
const ReservaService = require('../services/reservaService');
const CarrinhoService = require('../services/carrinhoService');
const { TEMPO_RESERVA_MIN, obterExpiraEmReserva } = require('../lib/reservaConfig');
const { anexarBrandingRifas, brandingEfetivo } = require('../lib/rifaBranding');

const tenantLocals = (req) => ({
  tenant: req.tenant,
  tenantBase: `/${req.tenant.slug}`
});

const publicController = {
  async index(req, res) {
    if (!req.tenant) return res.redirect('/');

    const page = parseInt(req.query.page) || 1;
    const { rifas, total, paginas } = await RifaService.listar({
      tenantId: req.tenant.id,
      status: 'ativa',
      page,
      limite: 9
    });
    const rifasComBrand = anexarBrandingRifas(rifas, req.tenant);

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
    const tenantUrl = `${baseUrl}/${req.tenant.slug}/`;
    const tenantDesc = req.tenant.descricao
      ? `${req.tenant.nome} — ${req.tenant.descricao}. Participe das rifas online com pagamento via PIX.`
      : `${req.tenant.nome} — Rifas online com pagamento via PIX. Concorra a prêmios incríveis com cotas a partir de R$ 1,00.`;

    res.render('public/index', {
      titulo: req.tenant.nome,
      seoTitle: `${req.tenant.nome} — Rifas Online`,
      seoDescription: tenantDesc.slice(0, 160),
      seoUrl: tenantUrl,
      seoType: 'website',
      seoImage: req.tenant.logoUrl || `${baseUrl}/img/vourifar-logo.png`,
      seoJsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Store',
        name: req.tenant.nome,
        url: tenantUrl,
        description: tenantDesc,
        ...(req.tenant.logoUrl ? { image: req.tenant.logoUrl } : {}),
        ...(req.tenant.whatsapp ? { telephone: req.tenant.whatsapp } : {}),
        ...(req.tenant.instagram ? { sameAs: [`https://instagram.com/${req.tenant.instagram}`] } : {})
      },
      rifas: rifasComBrand, page, paginas, total,
      ...tenantLocals(req)
    });
  },

  async encerradas(req, res) {
    const page = parseInt(req.query.page) || 1;
    const { rifas, paginas } = await RifaService.listarEncerradas(req.tenant.id, page, 12);
    res.render('public/encerradas', { titulo: 'Rifas Encerradas', rifas, page, paginas, ...tenantLocals(req) });
  },

  comoFunciona(req, res) {
    res.render('public/como-funciona', { titulo: 'Como funciona', ...tenantLocals(req) });
  },

  politicaPrivacidade(req, res) {
    res.render('public/politica-privacidade', { titulo: 'Política de privacidade', ...tenantLocals(req) });
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

    const baseUrl = res.locals.baseUrl || '';
    const rifaUrl = `${baseUrl}/${req.tenant.slug}/rifas/${rifa.id}`;
    const rifaDesc = rifa.descricao
      ? `${rifa.titulo} — ${String(rifa.descricao).replace(/<[^>]+>/g, '').slice(0, 100)}. Cota: R$ ${Number(rifa.valorCota).toFixed(2).replace('.', ',')}. Participe agora!`
      : `${rifa.titulo} — Participe desta rifa em ${req.tenant.nome}. Cota: R$ ${Number(rifa.valorCota).toFixed(2).replace('.', ',')}. Pagamento via PIX.`;
    const rifaImage = rifa.imagemUrl || req.tenant.logoUrl || `${baseUrl}/img/vourifar-logo.png`;

    const rifaJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: rifa.titulo,
      description: rifaDesc,
      image: rifaImage,
      url: rifaUrl,
      brand: { '@type': 'Brand', name: req.tenant.nome },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'BRL',
        price: Number(rifa.valorCota).toFixed(2),
        availability: rifa.status === 'ativa'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
        url: rifaUrl,
        seller: { '@type': 'Organization', name: req.tenant.nome }
      }
    };

    res.render('public/rifa-detalhe', {
      titulo: rifa.titulo,
      seoTitle: `${rifa.titulo} — ${req.tenant.nome}`,
      seoDescription: rifaDesc.slice(0, 160),
      seoUrl: rifaUrl,
      seoType: 'product',
      seoImage: rifaImage,
      seoJsonLd: rifaJsonLd,
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

    res.render('public/sorteio-resultado', { titulo: `Resultado — ${rifa.titulo}`, rifa, ...tenantLocals(req) });
  },

  minhasReservas(req, res) {
    res.render('public/minhas-reservas', {
      titulo: 'Minhas Reservas', resultado: null, cpf: '', erro: null, csrfToken: res.locals.csrfToken,
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
      reserva, pagamento,
      tempoReservaMin: TEMPO_RESERVA_MIN,
      reservaExpiraEm: obterExpiraEmReserva(reserva).toISOString(),
      ...tenantLocals(req)
    });
  }
};

module.exports = publicController;
