/**
 * Controller super-admin da plataforma.
 */
const TenantService = require('../services/tenantService');
const SuperAdminService = require('../services/superAdminService');
const AuthService = require('../services/authService');

function fmtMoney(v) {
  return Number(v || 0).toFixed(2).replace('.', ',');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function mapTenants(rows) {
  return rows.map((t) => ({
    ...t,
    createdAtFmt: fmtDate(t.createdAt),
    pixOk: !!(t.pixChave || t.wooviAtivo || t.mpAccessToken),
    org: t.organizadores?.[0] || null
  }));
}

function renderLocals(req, res, extra = {}) {
  return {
    adminUsuario: req.session.adminUsuario,
    msg: req.query.msg || null,
    erro: req.query.erro || null,
    csrfToken: res.locals.csrfToken,
    baseUrl: res.locals.baseUrl,
    ...extra
  };
}

const superAdminController = {
  loginForm(req, res) {
    if (req.session.adminLogado) return res.redirect('/super');
    res.render('super/login', { titulo: 'Super Admin', erro: null, csrfToken: res.locals.csrfToken });
  },

  async login(req, res) {
    const admin = await AuthService.loginAdmin(req.body.usuario, req.body.senha);
    if (admin) {
      req.session.adminLogado = true;
      req.session.adminUsuario = admin.usuario;
      return res.redirect('/super');
    }
    res.render('super/login', { titulo: 'Super Admin', erro: 'Credenciais inválidas.', csrfToken: res.locals.csrfToken });
  },

  logout(req, res) {
    req.session.adminLogado = false;
    req.session.adminUsuario = null;
    res.redirect('/super/login');
  },

  async dashboard(req, res) {
    const [metricas, recentes] = await Promise.all([
      TenantService.obterMetricasPlataforma(),
      TenantService.obterTenantsRecentes(5)
    ]);

    res.render('super/dashboard', renderLocals(req, res, {
      titulo: 'Visão geral',
      active: 'overview',
      metricas: {
        ...metricas,
        gmvTotalFmt: fmtMoney(metricas.gmvTotal),
        receitaPlataformaFmt: fmtMoney(metricas.receitaPlataforma)
      },
      recentes: recentes.map((t) => ({
        ...t,
        createdAtFmt: fmtDate(t.createdAt),
        orgEmail: t.organizadores?.[0]?.email || null
      }))
    }));
  },

  async sistemas(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const busca = String(req.query.q || '').trim();
    const status = ['todos', 'ativo', 'suspenso'].includes(req.query.status) ? req.query.status : 'todos';
    const listagem = await TenantService.listar({ page, busca, status });

    res.render('super/sistemas', renderLocals(req, res, {
      titulo: 'Sistemas',
      active: 'sistemas',
      tenants: mapTenants(listagem.tenants),
      paginas: listagem.paginas,
      page: listagem.page,
      total: listagem.total,
      busca,
      statusFiltro: status
    }));
  },

  async rifas(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const busca = String(req.query.q || '').trim();
    const status = ['todos', 'ativa', 'encerrada', 'cancelada'].includes(req.query.status) ? req.query.status : 'todos';
    const listagem = await SuperAdminService.listarRifas({ page, busca, status });

    res.render('super/rifas', renderLocals(req, res, {
      titulo: 'Rifas',
      active: 'rifas',
      rifas: listagem.rifas.map((r) => ({
        ...r,
        createdAtFmt: fmtDate(r.createdAt),
        sorteioFmt: fmtDate(r.dataSorteio),
        valorFmt: fmtMoney(r.valorCota)
      })),
      paginas: listagem.paginas,
      page: listagem.page,
      total: listagem.total,
      busca,
      statusFiltro: status
    }));
  },

  async vendas(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const status = ['todos', 'confirmado', 'pendente'].includes(req.query.status) ? req.query.status : 'todos';
    const listagem = await SuperAdminService.listarVendas({ page, status });

    res.render('super/vendas', renderLocals(req, res, {
      titulo: 'Vendas',
      active: 'vendas',
      vendas: listagem.vendas.map((v) => ({
        ...v,
        createdAtFmt: fmtDateTime(v.createdAt),
        valorFmt: fmtMoney(v.valorTotal),
        taxaFmt: fmtMoney(v.valorTotal * require('../lib/config').TAXA_PLATAFORMA),
        cotas: v._count?.reservaNumeros || 0
      })),
      paginas: listagem.paginas,
      page: listagem.page,
      total: listagem.total,
      statusFiltro: status
    }));
  },

  async organizadores(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const busca = String(req.query.q || '').trim();
    const listagem = await SuperAdminService.listarOrganizadores({ page, busca });

    res.render('super/organizadores', renderLocals(req, res, {
      titulo: 'Organizadores',
      active: 'organizadores',
      organizadores: listagem.organizadores.map((o) => ({
        ...o,
        createdAtFmt: fmtDate(o.createdAt),
        viaGoogle: !!o.googleId
      })),
      paginas: listagem.paginas,
      page: listagem.page,
      total: listagem.total,
      busca
    }));
  },

  async plataforma(req, res) {
    const [metricas, info] = await Promise.all([
      TenantService.obterMetricasPlataforma(),
      SuperAdminService.obterInfoPlataforma()
    ]);

    res.render('super/plataforma', renderLocals(req, res, {
      titulo: 'Plataforma',
      active: 'plataforma',
      metricas: {
        ...metricas,
        receitaPlataformaFmt: fmtMoney(metricas.receitaPlataforma),
        gmvTotalFmt: fmtMoney(metricas.gmvTotal)
      },
      info
    }));
  },

  async alterarStatus(req, res) {
    const redirect = req.body.redirect || '/super/sistemas';
    try {
      await TenantService.alterarStatus(req.params.id, req.body.status);
      const sep = redirect.includes('?') ? '&' : '?';
      res.redirect(`${redirect}${sep}msg=Status atualizado.`);
    } catch (err) {
      const sep = redirect.includes('?') ? '&' : '?';
      res.redirect(`${redirect}${sep}erro=${encodeURIComponent(err.message)}`);
    }
  }
};

module.exports = superAdminController;
