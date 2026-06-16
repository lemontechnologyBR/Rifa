/**
 * Controller do painel administrativo.
 */

const RifaService = require('../services/rifaService');
const ReservaService = require('../services/reservaService');
const AuthService = require('../services/authService');
const LogService = require('../services/logService');

const adminController = {
  loginForm(req, res) {
    if (req.session.adminLogado) return res.redirect('/admin');
    res.render('admin/login', { titulo: 'Login Admin', erro: null, csrfToken: res.locals.csrfToken });
  },

  async login(req, res) {
    const admin = await AuthService.loginAdmin(req.body.usuario, req.body.senha);
    if (admin) {
      req.session.adminLogado = true;
      req.session.adminUsuario = admin.usuario;
      return res.redirect('/admin');
    }
    res.render('admin/login', { titulo: 'Login Admin', erro: 'Credenciais inválidas.', csrfToken: res.locals.csrfToken });
  },

  logout(req, res) {
    req.session.destroy();
    res.redirect('/admin/login');
  },

  async dashboard(req, res) {
    const status = req.query.status || '';
    const busca = req.query.busca || '';
    const { rifas, paginas, page } = await RifaService.listar({
      status: status || undefined,
      page: parseInt(req.query.page) || 1,
      limite: 20,
      busca
    });

    const metricas = await RifaService.obterMetricasDashboard();
    const logs = await LogService.listar(20);

    res.render('admin/dashboard', {
      titulo: 'Painel Administrativo',
      rifas, metricas, logs, paginas, page,
      filtros: { status, busca },
      adminUsuario: req.session.adminUsuario,
      msg: req.query.msg || null,
      erro: req.query.erro || null,
      csrfToken: res.locals.csrfToken
    });
  },

  novaRifaForm(req, res) {
    res.render('admin/rifa-form', { titulo: 'Nova Rifa', rifa: null, erro: null, csrfToken: res.locals.csrfToken });
  },

  async criarRifa(req, res) {
    try {
      const premios = parsePremios(req.body);
      const faixas = parseFaixas(req.body);

      await RifaService.criar({ ...req.body, premios, faixas }, req.session.adminUsuario);
      res.redirect('/admin?msg=Rifa criada com sucesso!');
    } catch (err) {
      res.render('admin/rifa-form', { titulo: 'Nova Rifa', rifa: req.body, erro: err.message, csrfToken: res.locals.csrfToken });
    }
  },

  async editarRifaForm(req, res) {
    const rifa = await RifaService.buscarPorId(req.params.id);
    if (!rifa) return res.status(404).send('Rifa não encontrada');
    res.render('admin/rifa-form', { titulo: 'Editar Rifa', rifa, erro: null, csrfToken: res.locals.csrfToken });
  },

  async atualizarRifa(req, res) {
    try {
      await RifaService.atualizar(req.params.id, req.body, req.session.adminUsuario);
      res.redirect('/admin?msg=Rifa atualizada!');
    } catch (err) {
      const rifa = await RifaService.buscarPorId(req.params.id);
      res.render('admin/rifa-form', { titulo: 'Editar Rifa', rifa: { ...rifa, ...req.body }, erro: err.message, csrfToken: res.locals.csrfToken });
    }
  },

  async participantes(req, res) {
    const rifa = await RifaService.buscarPorId(req.params.id);
    if (!rifa) return res.status(404).send('Rifa não encontrada');

    const reservas = await ReservaService.listarPorRifa(rifa.id);
    const stats = await RifaService.obterEstatisticas(rifa.id);

    res.render('admin/participantes', {
      titulo: `Participantes — ${rifa.titulo}`,
      rifa, reservas, stats,
      mensagem: req.query.msg || null,
      erro: req.query.erro || null,
      csrfToken: res.locals.csrfToken
    });
  },

  async confirmarPagamento(req, res) {
    try {
      await ReservaService.confirmarPagamento(req.params.reservaId, req.session.adminUsuario);
      res.redirect(`/admin/rifas/${req.params.id}/participantes?msg=Pagamento confirmado!`);
    } catch (err) {
      res.redirect(`/admin/rifas/${req.params.id}/participantes?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async cancelarReserva(req, res) {
    try {
      await ReservaService.cancelar(req.params.reservaId, req.session.adminUsuario);
      res.redirect(`/admin/rifas/${req.params.id}/participantes?msg=Reserva cancelada.`);
    } catch (err) {
      res.redirect(`/admin/rifas/${req.params.id}/participantes?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async sortear(req, res) {
    try {
      const resultados = await RifaService.realizarSorteio(req.params.id, req.session.adminUsuario);
      const msg = resultados.map((r) => `${r.premio}: nº${r.numero} (${r.ganhador})`).join(' | ');
      res.redirect(`/admin/rifas/${req.params.id}/participantes?msg=${encodeURIComponent('Sorteio: ' + msg)}`);
    } catch (err) {
      res.redirect(`/admin/rifas/${req.params.id}/participantes?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async excluirRifa(req, res) {
    try {
      await RifaService.excluir(req.params.id, req.session.adminUsuario);
      res.redirect('/admin?msg=Rifa excluída.');
    } catch (err) {
      res.redirect(`/admin?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async exportarCSV(req, res) {
    const csv = await RifaService.exportarParticipantesCSV(req.params.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=participantes-rifa-${req.params.id}.csv`);
    res.send('\uFEFF' + csv);
  },

  async logs(req, res) {
    const logs = await LogService.listar(100);
    res.render('admin/logs', { titulo: 'Log de Atividades', logs, csrfToken: res.locals.csrfToken });
  }
};

/** Parse prêmios do formulário dinâmico */
function parsePremios(body) {
  const premios = [];
  if (body.premio_titulo) {
    const titulos = Array.isArray(body.premio_titulo) ? body.premio_titulo : [body.premio_titulo];
    const descs = Array.isArray(body.premio_descricao) ? body.premio_descricao : [body.premio_descricao || ''];
    titulos.forEach((t, i) => {
      if (t) premios.push({ titulo: t, descricao: descs[i] || '' });
    });
  }
  return premios;
}

function parseFaixas(body) {
  const faixas = [];
  if (body.faixa_qtd) {
    const qtds = Array.isArray(body.faixa_qtd) ? body.faixa_qtd : [body.faixa_qtd];
    const vals = Array.isArray(body.faixa_valor) ? body.faixa_valor : [body.faixa_valor];
    qtds.forEach((q, i) => {
      if (q && vals[i]) faixas.push({ quantidade_min: q, valor_total: vals[i] });
    });
  }
  return faixas;
}

module.exports = adminController;
