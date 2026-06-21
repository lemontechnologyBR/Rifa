/**
 * Controller do painel do organizador (tenant admin).
 */
const RifaService = require('../services/rifaService');
const ReservaService = require('../services/reservaService');
const AuthService = require('../services/authService');
const TenantService = require('../services/tenantService');
const LogService = require('../services/logService');
const GoogleAuthService = require('../services/googleAuthService');
const OrganizadorService = require('../services/organizadorService');

function cartPaymentContext(tenant) {
  const PaymentService = require('../services/paymentService');
  const MercadoPagoOAuthService = require('../services/mercadoPagoOAuthService');
  const mpSplitConfigured = MercadoPagoOAuthService.isSplitConfigured();
  const mpConnected = MercadoPagoOAuthService.isTenantConnected(tenant);
  return {
    carteiraOk: PaymentService.isConfigured(tenant),
    mpSplitConfigured,
    mpConnected,
    usesSplit: mpSplitConfigured && mpConnected
  };
}

const organizadorController = {
  loginForm(req, res) {
    if (req.session.organizadorId && req.session.tenantId === req.tenant.id) {
      return res.redirect(`/${req.tenant.slug}/admin`);
    }
    res.render('admin/login', {
      titulo: `Login — ${req.tenant.nome}`,
      tenant: req.tenant,
      adminBase: `/${req.tenant.slug}/admin`,
      tenantBase: `/${req.tenant.slug}`,
      erro: req.query.erro ? decodeURIComponent(String(req.query.erro).replace(/\+/g, ' ')) : null,
      googleEnabled: GoogleAuthService.isConfigured(),
      csrfToken: res.locals.csrfToken
    });
  },

  async login(req, res) {
    try {
      const org = await AuthService.loginOrganizador(req.body.email, req.body.senha, req.tenant.id);
      if (!org) {
        return res.render('admin/login', {
          titulo: `Login — ${req.tenant.nome}`,
          tenant: req.tenant,
          adminBase: `/${req.tenant.slug}/admin`,
          tenantBase: `/${req.tenant.slug}`,
          erro: 'E-mail ou senha incorretos.',
          googleEnabled: GoogleAuthService.isConfigured(),
          csrfToken: res.locals.csrfToken
        });
      }
      req.session.organizadorId = org.id;
      req.session.tenantId = req.tenant.id;
      req.session.tenantSlug = req.tenant.slug;
      req.session.organizadorNome = org.nome;
      res.redirect(`/${req.tenant.slug}/admin`);
    } catch (err) {
      res.render('admin/login', {
        titulo: `Login — ${req.tenant.nome}`,
        tenant: req.tenant,
        adminBase: `/${req.tenant.slug}/admin`,
        tenantBase: `/${req.tenant.slug}`,
        erro: err.message,
        googleEnabled: GoogleAuthService.isConfigured(),
        csrfToken: res.locals.csrfToken
      });
    }
  },

  logout(req, res) {
    req.session.organizadorId = null;
    req.session.tenantId = null;
    req.session.tenantSlug = null;
    req.session.organizadorNome = null;
    res.redirect(`/${req.tenant.slug}/admin/login`);
  },

  async dashboard(req, res) {
    const tid = req.tenant.id;
    const metricas = await RifaService.obterMetricasDashboard(tid);
    const logs = await LogService.listar(20, tid);
    const ab = `/${req.tenant.slug}/admin`;

    res.render('admin/dashboard', {
      titulo: `Painel — ${req.tenant.nome}`,
      tenant: req.tenant,
      adminBase: ab,
      tenantBase: `/${req.tenant.slug}`,
      metricas,
      logs,
      adminUsuario: req.session.organizadorNome,
      active: 'dashboard',
      msg: req.query.msg || null,
      erro: req.query.erro || null,
      csrfToken: res.locals.csrfToken
    });
  },

  async listarRifas(req, res) {
    const tid = req.tenant.id;
    const page = parseInt(req.query.page) || 1;
    const { rifas, paginas, total } = await RifaService.listar({
      tenantId: tid,
      status: null,
      page,
      limite: 20,
      busca: ''
    });
    const ab = `/${req.tenant.slug}/admin`;
    const paymentCtx = cartPaymentContext(req.tenant);

    res.render('admin/rifas', {
      titulo: `Rifas — ${req.tenant.nome}`,
      tenant: req.tenant,
      ...paymentCtx,
      adminBase: ab,
      tenantBase: `/${req.tenant.slug}`,
      rifas,
      paginas,
      page,
      totalRifas: total,
      adminUsuario: req.session.organizadorNome,
      active: 'rifas',
      msg: req.query.msg ? decodeURIComponent(String(req.query.msg).replace(/\+/g, ' ')) : null,
      erro: req.query.erro ? decodeURIComponent(String(req.query.erro).replace(/\+/g, ' ')) : null,
      csrfToken: res.locals.csrfToken
    });
  },

  async configForm(req, res, next) {
    try {
      const { organizador, tenant, totalRifas } = await OrganizadorService.obterConta(
        req.session.organizadorId,
        req.tenant.id
      );
      res.render('admin/config', {
        titulo: 'Minha conta',
        tenant,
        organizador,
        totalRifas,
        adminBase: `/${tenant.slug}/admin`,
        tenantBase: `/${tenant.slug}`,
        adminUsuario: req.session.organizadorNome,
        active: 'config',
        msg: req.query.msg ? decodeURIComponent(String(req.query.msg).replace(/\+/g, ' ')) : null,
        erro: req.query.erro ? decodeURIComponent(String(req.query.erro).replace(/\+/g, ' ')) : null,
        csrfToken: res.locals.csrfToken
      });
    } catch (err) {
      next(err);
    }
  },

  async salvarConfig(req, res) {
    try {
      const { organizador, tenant } = await OrganizadorService.atualizarConta(
        req.session.organizadorId,
        req.tenant.id,
        req.body,
        req.session.organizadorNome
      );
      req.session.organizadorNome = organizador.nome;
      req.session.tenantSlug = tenant.slug;
      res.redirect(`/${tenant.slug}/admin/config?msg=${encodeURIComponent('Conta atualizada com sucesso!')}`);
    } catch (err) {
      res.redirect(`/${req.tenant.slug}/admin/config?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async carteiraForm(req, res, next) {
    try {
      const CarteiraService = require('../services/carteiraService');
      const MercadoPagoOAuthService = require('../services/mercadoPagoOAuthService');
      const SaqueService = require('../services/saqueService');
      const PaymentService = require('../services/paymentService');
      const { detectarTipoChavePix, labelTipoPix } = require('../lib/pixKey');
      const resumo = await CarteiraService.obterResumo(req.tenant.id);
      const saldoDisp = resumo.saldoDisponivel;
      const saque = SaqueService.calcularResumo(saldoDisp);
      const pixTipoDetectado = detectarTipoChavePix(req.tenant.pixChave);
      const pixTipo = req.query.tipo || pixTipoDetectado || 'cpf';
      const mpSplitConfigured = MercadoPagoOAuthService.isSplitConfigured();
      const mpConnected = MercadoPagoOAuthService.isTenantConnected(req.tenant);

      res.render('admin/carteira', {
        titulo: 'Carteira',
        tenant: req.tenant,
        resumo,
        saque,
        carteiraOk: PaymentService.isConfigured(req.tenant),
        mpSplitConfigured,
        mpConnected,
        usesSplit: mpSplitConfigured && mpConnected,
        gateway: PaymentService.getProvider(),
        pixTipo,
        pixTipoLabel: labelTipoPix(pixTipoDetectado),
        adminBase: `/${req.tenant.slug}/admin`,
        tenantBase: `/${req.tenant.slug}`,
        adminUsuario: req.session.organizadorNome,
        active: 'carteira',
        onboarding: req.query.onboarding === '1',
        msg: req.query.msg || null,
        erro: req.query.erro ? decodeURIComponent(String(req.query.erro).replace(/\+/g, ' ')) : null,
        csrfToken: res.locals.csrfToken
      });
    } catch (err) {
      next(err);
    }
  },

  async salvarCarteira(req, res) {
    try {
      const CarteiraService = require('../services/carteiraService');
      await CarteiraService.salvarConfig(req.tenant.id, req.body);
      res.redirect(`/${req.tenant.slug}/admin/carteira?msg=Carteira atualizada!`);
    } catch (err) {
      const tipo = req.body.pix_tipo ? `&tipo=${encodeURIComponent(req.body.pix_tipo)}` : '';
      res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent(err.message)}${tipo}`);
    }
  },

  async solicitarSaque(req, res) {
    try {
      const PaymentService = require('../services/paymentService');
      const CarteiraService = require('../services/carteiraService');
      const SaqueService = require('../services/saqueService');
      const MercadoPagoOAuthService = require('../services/mercadoPagoOAuthService');

      if (!PaymentService.isConfigured(req.tenant)) {
        const msg = MercadoPagoOAuthService.isSplitConfigured()
          ? 'Conecte sua conta Mercado Pago antes de sacar.'
          : 'Configure sua chave PIX antes de sacar.';
        return res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent(msg)}`);
      }

      if (MercadoPagoOAuthService.isSplitConfigured() && MercadoPagoOAuthService.isTenantConnected(req.tenant)) {
        return res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent('Pagamentos caem direto na sua conta Mercado Pago — saque manual não se aplica.')}`);
      }

      const resumoCarteira = await CarteiraService.obterResumo(req.tenant.id);
      const saldoDisp = resumoCarteira.saldoDisponivel;

      const { resumo: saqueResumo } = await SaqueService.processarSaque(
        req.tenant,
        saldoDisp,
        req.session.organizadorNome || req.session.adminUsuario
      );

      const valorFmt = `R$ ${saqueResumo.saldoLiquido.toFixed(2).replace('.', ',')}`;
      const taxaMsg = saqueResumo.taxa > 0
        ? ` Taxa de saque: R$ ${saqueResumo.taxa.toFixed(2).replace('.', ',')}.`
        : '';
      const msg = PaymentService.getProvider() === 'mercadopago'
        ? `Saque registrado! Você receberá ${valorFmt} na sua chave PIX em até 1 dia útil.${taxaMsg}`
        : `Saque solicitado com sucesso! Você receberá ${valorFmt} na sua chave PIX.${taxaMsg}`;

      res.redirect(`/${req.tenant.slug}/admin/carteira?msg=${encodeURIComponent(msg)}`);
    } catch (err) {
      res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent(err.message)}`);
    }
  },

  novaRifaForm(req, res) {
    res.redirect(`/${req.tenant.slug}/admin/rifas?nova=1`);
  },

  uploadImagemRifa(req, res) {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });
    }
    const url = `/uploads/rifas/${req.tenant.id}/${req.file.filename}`;
    res.json({ url });
  },

  async criarRifa(req, res) {
    const ab = `/${req.tenant.slug}/admin`;
    const paymentCtx = cartPaymentContext(req.tenant);
    if (req.validationErrors?.length) {
      return res.render('admin/rifa-form', {
        titulo: 'Nova Rifa', tenant: req.tenant, adminBase: ab, tenantBase: `/${req.tenant.slug}`,
        adminUsuario: req.session.organizadorNome, active: 'rifas', pageTitle: 'Nova Rifa',
        rifa: req.body, erro: req.validationErrors.join(' '), csrfToken: res.locals.csrfToken,
        ...paymentCtx
      });
    }
    try {
      await RifaService.criar(
        { ...req.body, premios: parsePremios(req.body), faixas: parseFaixas(req.body) },
        req.session.organizadorNome,
        req.tenant.id
      );
      res.redirect(`${ab}/rifas?msg=Rifa criada com sucesso!`);
    } catch (err) {
      res.render('admin/rifa-form', {
        titulo: 'Nova Rifa', tenant: req.tenant, adminBase: ab, tenantBase: `/${req.tenant.slug}`,
        adminUsuario: req.session.organizadorNome, active: 'rifas', pageTitle: 'Nova Rifa',
        rifa: req.body, erro: err.message, csrfToken: res.locals.csrfToken,
        ...paymentCtx
      });
    }
  },

  async editarRifaForm(req, res) {
    const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
    if (!rifa) return res.status(404).send('Rifa não encontrada');
    rifa.stats = await RifaService.obterEstatisticas(rifa.id);
    res.render('admin/rifa-form', {
      titulo: 'Editar Rifa', tenant: req.tenant,
      adminBase: `/${req.tenant.slug}/admin`, tenantBase: `/${req.tenant.slug}`,
      adminUsuario: req.session.organizadorNome, active: 'rifas', pageTitle: 'Editar Rifa',
      rifa, erro: null, csrfToken: res.locals.csrfToken,
      ...cartPaymentContext(req.tenant)
    });
  },

  async atualizarRifa(req, res) {
    const ab = `/${req.tenant.slug}/admin`;
    const paymentCtx = cartPaymentContext(req.tenant);
    if (req.validationErrors?.length) {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      return res.render('admin/rifa-form', {
        titulo: 'Editar Rifa', tenant: req.tenant, adminBase: ab, tenantBase: `/${req.tenant.slug}`,
        adminUsuario: req.session.organizadorNome, active: 'rifas', pageTitle: 'Editar Rifa',
        rifa: mergeRifaForm(rifa, req.body), erro: req.validationErrors.join(' '), csrfToken: res.locals.csrfToken,
        ...paymentCtx
      });
    }
    try {
      await RifaService.atualizar(req.params.id, req.body, req.session.organizadorNome, req.tenant.id);
      res.redirect(`${ab}/rifas?msg=Rifa atualizada!`);
    } catch (err) {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      res.render('admin/rifa-form', {
        titulo: 'Editar Rifa', tenant: req.tenant, adminBase: ab, tenantBase: `/${req.tenant.slug}`,
        adminUsuario: req.session.organizadorNome, active: 'rifas', pageTitle: 'Editar Rifa',
        rifa: mergeRifaForm(rifa, req.body), erro: err.message, csrfToken: res.locals.csrfToken,
        ...paymentCtx
      });
    }
  },

  async participantes(req, res) {
    const PaymentService = require('../services/paymentService');
    const ab = `/${req.tenant.slug}/admin`;
    const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
    if (!rifa) return res.status(404).send('Rifa não encontrada');

    const reservas = await ReservaService.listarPorRifa(rifa.id);
    const stats = await RifaService.obterEstatisticas(rifa.id);

    res.render('admin/participantes', {
      titulo: `Participantes — ${rifa.titulo}`,
      tenant: req.tenant, adminBase: ab, tenantBase: `/${req.tenant.slug}`,
      adminUsuario: req.session.organizadorNome, active: 'rifas', pageTitle: 'Participantes',
      rifa, reservas, stats,
      pagamentoAtivo: PaymentService.isConfigured(req.tenant),
      mensagem: req.query.msg || null,
      erro: req.query.erro || null,
      csrfToken: res.locals.csrfToken
    });
  },

  async confirmarPagamento(req, res) {
    const ab = `/${req.tenant.slug}/admin/rifas/${req.params.id}/participantes`;
    try {
      await ReservaService.confirmarPagamento(
        req.params.reservaId, req.session.organizadorNome, req.tenant.id, req.params.id
      );
      res.redirect(`${ab}?msg=Pagamento confirmado!`);
    } catch (err) {
      res.redirect(`${ab}?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async cancelarReserva(req, res) {
    const ab = `/${req.tenant.slug}/admin/rifas/${req.params.id}/participantes`;
    try {
      await ReservaService.cancelar(
        req.params.reservaId, req.session.organizadorNome, req.tenant.id, req.params.id
      );
      res.redirect(`${ab}?msg=Reserva cancelada.`);
    } catch (err) {
      res.redirect(`${ab}?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async sortear(req, res) {
    const ab = `/${req.tenant.slug}/admin/rifas/${req.params.id}/participantes`;
    try {
      const resultados = await RifaService.realizarSorteio(req.params.id, req.session.organizadorNome, req.tenant.id);
      const msg = resultados.map((r) => `${r.premio}: nº${r.numero} (${r.ganhador})`).join(' | ');
      res.redirect(`${ab}?msg=${encodeURIComponent('Sorteio: ' + msg)}`);
    } catch (err) {
      res.redirect(`${ab}?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async excluirRifa(req, res) {
    const ab = `/${req.tenant.slug}/admin`;
    try {
      await RifaService.excluir(req.params.id, req.session.organizadorNome, req.tenant.id);
      res.redirect(`${ab}/rifas?msg=Rifa excluída.`);
    } catch (err) {
      res.redirect(`${ab}?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async exportarCSV(req, res) {
    const csv = await RifaService.exportarParticipantesCSV(req.params.id, req.tenant.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=participantes-rifa-${req.params.id}.csv`);
    res.send('\uFEFF' + csv);
  },

  async logs(req, res) {
    const logs = await LogService.listar(100, req.tenant.id);
    res.render('admin/logs', {
      titulo: 'Log de Atividades',
      tenant: req.tenant,
      adminBase: `/${req.tenant.slug}/admin`,
      tenantBase: `/${req.tenant.slug}`,
      adminUsuario: req.session.organizadorNome,
      active: 'logs',
      pageTitle: 'Logs',
      logs,
      csrfToken: res.locals.csrfToken
    });
  }
};

function mergeRifaForm(rifa, body) {
  if (!rifa) return body;
  return {
    ...rifa,
    titulo: body.titulo ?? rifa.titulo,
    descricao: body.descricao ?? rifa.descricao,
    imagemUrl: body.imagem_url ?? rifa.imagemUrl,
    valorCota: body.valor_cota ?? rifa.valorCota,
    dataSorteio: body.data_sorteio ?? rifa.dataSorteio,
    chavePix: body.chave_pix ?? rifa.chavePix,
    metaMinimaPct: body.meta_minima_pct ?? rifa.metaMinimaPct
  };
}

function parsePremios(body) {
  const premios = [];
  if (body.premio_titulo) {
    const titulos = Array.isArray(body.premio_titulo) ? body.premio_titulo : [body.premio_titulo];
    const descs = Array.isArray(body.premio_descricao) ? body.premio_descricao : [body.premio_descricao || ''];
    titulos.forEach((t, i) => { if (t) premios.push({ titulo: t, descricao: descs[i] || '' }); });
  }
  return premios;
}

function parseFaixas(body) {
  const faixas = [];
  if (body.faixa_qtd) {
    const qtds = Array.isArray(body.faixa_qtd) ? body.faixa_qtd : [body.faixa_qtd];
    const vals = Array.isArray(body.faixa_valor) ? body.faixa_valor : [body.faixa_valor];
    qtds.forEach((q, i) => { if (q && vals[i]) faixas.push({ quantidade_min: q, valor_total: vals[i] }); });
  }
  return faixas;
}

module.exports = organizadorController;
