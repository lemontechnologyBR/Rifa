/**
 * Controller super-admin da plataforma.
 */
const TenantService = require('../services/tenantService');
const SuperAdminService = require('../services/superAdminService');
const AuthService = require('../services/authService');
const PaymentService = require('../services/paymentService');
const PlatformSettingsService = require('../services/platformSettingsService');
const AnalyticsService = require('../services/analyticsService');

function fmtMoney(v) {
  return Number(v || 0).toFixed(2).replace('.', ',');
}

/**
 * Saldos no estilo do painel Woovi:
 * - Saldo da conta = balance.available da API
 * - Subcontas = soma LIVE em cache (API) ou estimativa DB
 * - Saldo disponível = conta − subcontas
 */
function montarWooviSaldosView(saldoConta, saldosCarteira, cacheLive = null) {
  const conta = saldoConta ? Number(saldoConta.available || 0) : null;
  const bloqueado = saldoConta ? Number(saldoConta.blocked || 0) : 0;
  const estimado = saldosCarteira?.saldoSubcontasEstimado != null
    ? Number(saldosCarteira.saldoSubcontasEstimado)
    : null;
  const live = cacheLive?.subcontasLive != null ? Number(cacheLive.subcontasLive) : null;
  const usaLive = live != null;
  const subcontas = usaLive ? live : estimado;

  let disponivel = null;
  if (conta != null && subcontas != null) {
    disponivel = Math.max(0, Math.round((conta - subcontas) * 100) / 100);
  } else if (conta != null) {
    disponivel = conta;
  }

  let atualizadoHint = '';
  if (usaLive && cacheLive?.updatedAt) {
    const min = Math.max(0, Math.round((Date.now() - cacheLive.updatedAt) / 60000));
    atualizadoHint = min <= 0 ? 'agora' : `há ${min} min`;
  }

  return {
    conta: saldoConta,
    contaSaldo: conta,
    contaSaldoFmt: conta != null ? fmtMoney(conta) : '—',
    contaBlockedFmt: fmtMoney(bloqueado),
    subcontasEstimado: estimado,
    subcontasLive: live,
    subcontasFonte: usaLive ? 'api' : 'estimado',
    subcontasEstimadoFmt: subcontas != null ? fmtMoney(subcontas) : '—',
    subcontasAtualizadoHint: atualizadoHint,
    tenantsComSaldo: saldosCarteira?.tenantsComSaldo || cacheLive?.tenants || 0,
    saldoDisponivel: disponivel,
    saldoDisponivelFmt: disponivel != null ? fmtMoney(disponivel) : '—'
  };
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function pixRecebimentoInfo(tenant) {
  if (!tenant) return { tipo: null, valor: null };
  if (tenant.pixChave) {
    const { detectarTipoChavePix, labelTipoPix } = require('../lib/pixKey');
    const tipoPix = detectarTipoChavePix(tenant.pixChave);
    return { tipo: labelTipoPix(tipoPix), valor: tenant.pixChave };
  }
  return { tipo: null, valor: null };
}

function mapOrganizadorConta(o) {
  return {
    ...o,
    createdAtFmt: fmtDate(o.createdAt),
    tenantCreatedAtFmt: fmtDate(o.tenant?.createdAt),
    viaGoogle: !!o.googleId,
    nurtureD1: !!o.nurtureD1SentAt,
    nurtureD3: !!o.nurtureD3SentAt,
    campanhaLeads: !!o.campanhaLeadsSentAt,
    pixInfo: pixRecebimentoInfo(o.tenant),
    totalSacadoFmt: fmtMoney(o.totalSacado)
  };
}

async function renderContas(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const busca = String(req.query.q || '').trim();
  const filtro = ['sem_rifa', 'leads_quentes', 'sem_carteira'].includes(req.query.filtro) ? req.query.filtro : '';
  const status = ['todos', 'ativo', 'suspenso'].includes(req.query.status) ? req.query.status : 'todos';
  const OnboardingEmailService = require('../services/onboardingEmailService');

  const [listagem, leadsQuentesPendentes] = await Promise.all([
    SuperAdminService.listarOrganizadores({ page, busca, filtro, status }),
    OnboardingEmailService.listarLeadsQuentes()
  ]);

  res.render('super/sistemas', renderLocals(req, res, {
    titulo: 'Contas',
    active: 'sistemas',
    organizadores: listagem.organizadores.map(mapOrganizadorConta),
    paginas: listagem.paginas,
    page: listagem.page,
    total: listagem.total,
    busca,
    filtro: filtro || '',
    statusFiltro: status,
    leadsQuentesPendentes: leadsQuentesPendentes.length
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
    const CarteiraService = require('../services/carteiraService');
    const WooviService = require('../services/wooviService');
    const WooviSaldoCacheService = require('../services/wooviSaldoCacheService');
    const [metricas, recentes, info, saldosCarteira, saldoConta, cacheLive] = await Promise.all([
      TenantService.obterMetricasPlataforma(),
      TenantService.obterTenantsRecentes(5),
      SuperAdminService.obterInfoPlataforma(),
      CarteiraService.somarSaldosSacaveisPlataforma().catch(() => ({
        saldoSubcontasEstimado: null,
        tenantsComSaldo: 0
      })),
      WooviService.consultarSaldoContaPrincipal().catch(() => null),
      WooviSaldoCacheService.getCached()
    ]);
    WooviSaldoCacheService.maybeRefreshAsync();

    const receitaMes = Number(metricas.receitaMes || 0);
    const taxasSaqueMes = Number(info.taxasSaqueMes || 0);
    const lucroMes = receitaMes + taxasSaqueMes;
    const wooviSaldos = montarWooviSaldosView(saldoConta, saldosCarteira, cacheLive);

    res.render('super/dashboard', renderLocals(req, res, {
      titulo: 'Visão geral',
      active: 'overview',
      metricas: {
        ...metricas,
        gmvTotalFmt: fmtMoney(metricas.gmvTotal),
        receitaPlataformaFmt: fmtMoney(receitaMes),
        receitaWooviFmt: fmtMoney(receitaMes),
        totalTaxasSaqueFmt: fmtMoney(taxasSaqueMes),
        lucroTotalFmt: fmtMoney(lucroMes),
        caixaDisponivelFmt: wooviSaldos.saldoDisponivelFmt
      },
      recentes: recentes.map((t) => ({
        ...t,
        createdAtFmt: fmtDate(t.createdAt),
        orgEmail: t.organizadores?.[0]?.email || null
      }))
    }));
  },

  async sistemas(req, res) {
    try {
      await renderContas(req, res);
    } catch (err) {
      console.error('[Super] /sistemas:', err);
      if (!res.headersSent) res.status(500).send('Erro interno do servidor.');
    }
  },

  async organizadores(req, res) {
    const qs = new URLSearchParams(req.query).toString();
    return res.redirect(`/super/sistemas${qs ? `?${qs}` : ''}`);
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

  async excluirRifa(req, res) {
    const redirect = req.body.redirect || '/super/rifas';
    const sep = redirect.includes('?') ? '&' : '?';
    try {
      const RifaService = require('../services/rifaService');
      const prisma = require('../lib/prisma');
      const rifa = await prisma.rifa.findUnique({
        where: { id: Number(req.params.id) },
        select: { id: true, tenantId: true, titulo: true }
      });
      if (!rifa) throw new Error('Rifa não encontrada.');

      await RifaService.excluir(
        rifa.id,
        req.session.adminUsuario || 'super',
        rifa.tenantId
      );
      res.redirect(
        `${redirect}${sep}msg=${encodeURIComponent(`Sorteio "${rifa.titulo}" excluído.`)}`
      );
    } catch (err) {
      res.redirect(`${redirect}${sep}erro=${encodeURIComponent(err.message)}`);
    }
  },

  async vendas(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const status = ['todos', 'confirmado', 'pendente'].includes(req.query.status) ? req.query.status : 'todos';
    const listagem = await SuperAdminService.listarVendas({ page, status });

    res.render('super/vendas', renderLocals(req, res, {
      titulo: 'Vendas',
      active: 'vendas',
      vendas: listagem.vendas.map((v) => {
        const tenant = v.rifa?.tenant;
        // Comissão total retida: % + R$0,50/cota (Woovi). KPI de receita do painel fica só com a %.
        const comissao = PaymentService.calcularReceitaReserva(v, tenant);
        return {
          ...v,
          createdAtFmt: fmtDateTime(v.createdAt),
          valorFmt: fmtMoney(v.valorTotal),
          taxaFmt: fmtMoney(comissao),
          taxaPctLabel: PaymentService.getTaxaLabelReserva(v, tenant),
          cotas: v._count?.reservaNumeros || 0
        };
      }),
      paginas: listagem.paginas,
      page: listagem.page,
      total: listagem.total,
      statusFiltro: status
    }));
  },

  async campanhaLeadsQuentes(req, res) {
    const OnboardingEmailService = require('../services/onboardingEmailService');
    try {
      const { enviados, total, erros } = await OnboardingEmailService.enviarCampanhaLeadsQuentes();
      let msg = `Campanha enviada para ${enviados} de ${total} lead(s) quente(s).`;
      if (erros.length) msg += ` ${erros.length} falha(s).`;
      res.redirect(`/super/sistemas?filtro=leads_quentes&msg=${encodeURIComponent(msg)}`);
    } catch (err) {
      res.redirect(`/super/sistemas?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async enviarNurtureOrganizador(req, res) {
    const OnboardingEmailService = require('../services/onboardingEmailService');
    const tipo = req.body.tipo === 'd3' ? 'd3' : 'd1';
    const redirect = req.body.redirect || '/super/sistemas';
    try {
      await OnboardingEmailService.enviarNurtureManual(req.params.id, tipo);
      const sep = redirect.includes('?') ? '&' : '?';
      res.redirect(`${redirect}${sep}msg=${encodeURIComponent(`E-mail ${tipo.toUpperCase()} enviado.`)}`);
    } catch (err) {
      const sep = redirect.includes('?') ? '&' : '?';
      res.redirect(`${redirect}${sep}erro=${encodeURIComponent(err.message)}`);
    }
  },

  async plataforma(req, res) {
    const CarteiraService = require('../services/carteiraService');
    const WooviService = require('../services/wooviService');
    const WooviSaldoCacheService = require('../services/wooviSaldoCacheService');

    const [metricas, info, saldosCarteira, saldoConta, cacheLive] = await Promise.all([
      TenantService.obterMetricasPlataforma(),
      SuperAdminService.obterInfoPlataforma(),
      CarteiraService.somarSaldosSacaveisPlataforma().catch(() => ({
        saldoSubcontasEstimado: null,
        tenantsComSaldo: 0
      })),
      WooviService.consultarSaldoContaPrincipal().catch(() => null),
      WooviSaldoCacheService.getCached()
    ]);
    WooviSaldoCacheService.maybeRefreshAsync();

    const gmvTotal = metricas.gmvTotal || 0;
    const reservasConf = metricas.reservasConfirmadas || 0;
    const ticketMedio = reservasConf > 0 ? gmvTotal / reservasConf : 0;
    const totalReservas = reservasConf + (info.reservasPendentes || 0) + (info.reservasExpiradas || 0);
    const taxaConversao = totalReservas > 0 ? ((reservasConf / totalReservas) * 100).toFixed(1) : '0.0';

    // Receita do painel = mês atual, só Woovi
    const receitaMes = Number(metricas.receitaMes || 0);
    const taxasSaqueMes = Number(info.taxasSaqueMes || 0);
    const lucroMes = receitaMes + taxasSaqueMes;
    const wooviSaldos = montarWooviSaldosView(saldoConta, saldosCarteira, cacheLive);

    res.render('super/plataforma', renderLocals(req, res, {
      titulo: 'Plataforma',
      active: 'plataforma',
      metricas: {
        ...metricas,
        gmvTotalFmt: fmtMoney(gmvTotal),
        gmvWooviFmt: fmtMoney(metricas.gmvWoovi),
        receitaPlataformaFmt: fmtMoney(receitaMes),
        receitaWooviFmt: fmtMoney(receitaMes),
        receitaMesFmt: fmtMoney(receitaMes),
        totalTaxasSaque: taxasSaqueMes,
        totalTaxasSaqueFmt: fmtMoney(taxasSaqueMes),
        lucroTotal: lucroMes,
        lucroTotalFmt: fmtMoney(lucroMes),
        ticketMedioFmt: fmtMoney(ticketMedio),
        taxaConversao
      },
      info: {
        ...info,
        totalSacadoFmt: fmtMoney(info.totalSacadoLiquido),
        totalTaxasSaqueFmt: fmtMoney(info.totalTaxasSaque),
        saquesPendentesFmt: fmtMoney(info.totalSaquesPendenteValor),
        gmvMesFmt: fmtMoney(info.gmvMes ?? metricas.gmvMes),
        vendasMes: info.vendasMes ?? metricas.vendasMes
      },
      wooviSaldos
    }));
  },

  async marketing(req, res) {
    return res.redirect('/super/operacoes?aba=ferramentas');
  },

  async salvarMarketing(req, res) {
    try {
      await PlatformSettingsService.saveMarketingSettings({
        tagInput: req.body.google_ads_tag,
        enabled: req.body.google_ads_enabled === 'on'
      });
      res.redirect('/super/operacoes?aba=ferramentas&msg=' + encodeURIComponent('Tag Google Ads salva com sucesso.'));
    } catch (err) {
      res.redirect(`/super/operacoes?aba=ferramentas&erro=${encodeURIComponent(err.message)}`);
    }
  },

  async operacoes(req, res) {
    const abas = ['compliance', 'comunicados', 'auditoria', 'ferramentas'];
    const aba = abas.includes(req.query.aba) ? req.query.aba : 'compliance';

    const locals = {
      titulo: 'Operações',
      active: 'operacoes',
      aba
    };

    if (aba === 'compliance') {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const kyc = String(req.query.kyc || 'todos');
      const saldo = String(req.query.saldo || 'todos');
      const busca = String(req.query.q || '').trim();
      const data = await SuperAdminService.listarCompliance({ page, kyc, saldo, busca });
      Object.assign(locals, {
        compliance: data,
        kycFiltro: kyc,
        saldoFiltro: saldo,
        busca,
        page: data.page,
        paginas: data.paginas,
        total: data.total
      });
    } else if (aba === 'comunicados') {
      const AvisoNovidadesService = require('../services/avisoNovidadesService');
      const [comRifa, todosAtivos] = await Promise.all([
        AvisoNovidadesService.listarComRifaAtiva(),
        AvisoNovidadesService.listarTenantsAtivos()
      ]);
      let ultimoResultado = null;
      if (req.query.resultado) {
        try {
          ultimoResultado = JSON.parse(decodeURIComponent(String(req.query.resultado)));
        } catch {
          ultimoResultado = null;
        }
      }
      Object.assign(locals, {
        contagemRifaAtiva: comRifa.length,
        contagemTodosAtivos: todosAtivos.length,
        ultimoResultado
      });
    } else if (aba === 'auditoria') {
      const LogService = require('../services/logService');
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const acao = String(req.query.acao || '').trim();
      const busca = String(req.query.q || '').trim();
      const data = await LogService.listarPaginado({ page, acao, busca, limite: 50 });
      Object.assign(locals, {
        logs: data.logs.map((l) => ({
          ...l,
          createdAtFmt: fmtDateTime(l.createdAt)
        })),
        page: data.page,
        paginas: data.paginas,
        total: data.total,
        acaoFiltro: acao,
        busca
      });
    } else if (aba === 'ferramentas') {
      const settings = await PlatformSettingsService.getMarketingSettings();
      Object.assign(locals, {
        googleAdsTagId: settings.googleAdsTagId,
        googleAdsEnabled: settings.googleAdsEnabled
      });
    }

    res.render('super/operacoes', renderLocals(req, res, locals));
  },

  async enviarComunicado(req, res) {
    const dryRun = req.body.acao === 'simular';
    const publico = req.body.publico === 'todos_ativos' ? 'todos_ativos' : 'rifa_ativa';
    try {
      const AvisoNovidadesService = require('../services/avisoNovidadesService');
      const LogService = require('../services/logService');
      const result = await AvisoNovidadesService.enviarParaTodos({ dryRun, publico });
      await LogService.registrar(
        req.session.adminUsuario || 'super',
        dryRun ? 'comunicado_dry_run' : 'comunicado_envio',
        `${dryRun ? 'Simulação' : 'Envio'} · público=${publico} · total=${result.total} · enviados=${result.enviados} · erros=${result.erros.length}`
      );
      const payload = encodeURIComponent(JSON.stringify({
        dryRun: result.dryRun,
        publico: result.publico,
        total: result.total,
        enviados: result.enviados,
        erros: (result.erros || []).slice(0, 20)
      }));
      const msg = dryRun
        ? `Simulação: ${result.total} destinatário(s).`
        : `Comunicado enviado: ${result.enviados}/${result.total}.`;
      res.redirect(`/super/operacoes?aba=comunicados&msg=${encodeURIComponent(msg)}&resultado=${payload}`);
    } catch (err) {
      res.redirect(`/super/operacoes?aba=comunicados&erro=${encodeURIComponent(err.message)}`);
    }
  },

  async resetarKyc(req, res) {
    const redirect = req.body.redirect || '/super/operacoes?aba=compliance';
    const sep = redirect.includes('?') ? '&' : '?';
    try {
      await SuperAdminService.resetarKyc(req.params.id, req.session.adminUsuario);
      res.redirect(`${redirect}${sep}msg=${encodeURIComponent('KYC resetado. O organizador pode verificar novamente.')}`);
    } catch (err) {
      res.redirect(`${redirect}${sep}erro=${encodeURIComponent(err.message)}`);
    }
  },

  async saques(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const status = ['todos', 'solicitado', 'processando', 'concluido', 'erro'].includes(req.query.status)
      ? req.query.status : 'todos';
    const busca = String(req.query.q || '').trim();

    const [listagem, resumo] = await Promise.all([
      SuperAdminService.listarSaques({ page, status, busca }),
      SuperAdminService.resumoSaques()
    ]);

    res.render('super/saques', renderLocals(req, res, {
      titulo: 'Saques',
      active: 'saques',
      saques: listagem.saques.map((s) => ({
        ...s,
        createdAtFmt: fmtDateTime(s.createdAt),
        valorBrutoFmt: fmtMoney(s.valorBruto),
        valorLiquidoFmt: fmtMoney(s.valorLiquido),
        taxaFmt: fmtMoney(s.taxa),
        tenantNome: s.tenant?.nome || '—',
        tenantSlug: s.tenant?.slug || '',
        orgEmail: s.tenant?.organizadores?.[0]?.email || null
      })),
      paginas: listagem.paginas,
      page: listagem.page,
      total: listagem.total,
      statusFiltro: status,
      busca,
      resumo: {
        totalConcluidoFmt: fmtMoney(resumo.totalConcluido),
        countConcluido: resumo.countConcluido,
        totalPendenteFmt: fmtMoney(resumo.totalPendente),
        countPendente: resumo.countPendente,
        totalTaxasFmt: fmtMoney(resumo.totalTaxas || 0)
      }
    }));
  },

  async analytics(req, res) {
    const dias = parseInt(req.query.dias, 10) || 7;
    const data = await AnalyticsService.obterDashboard(dias);
    res.render('super/analytics', renderLocals(req, res, {
      titulo: 'Analytics',
      active: 'analytics',
      RETENTION_DAYS: AnalyticsService.RETENTION_DAYS,
      dias: data.periodo,
      ...data
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
  },

  async alterarSaldoBloqueado(req, res) {
    const redirect = req.body.redirect || '/super/sistemas';
    try {
      const LogService = require('../services/logService');
      const bloquear = req.body.acao === 'bloquear';
      const tenant = await TenantService.alterarSaldoBloqueado(req.params.id, bloquear);
      await LogService.registrar(
        req.session.adminUsuario || 'super',
        bloquear ? 'saldo_bloquear' : 'saldo_desbloquear',
        `${bloquear ? 'Bloqueou' : 'Desbloqueou'} saldo · tenant #${tenant.id} ${tenant.nome || tenant.slug || ''}`,
        tenant.id
      );
      const sep = redirect.includes('?') ? '&' : '?';
      const msg = bloquear ? 'Saldo do tenant bloqueado.' : 'Saldo do tenant desbloqueado.';
      res.redirect(`${redirect}${sep}msg=${encodeURIComponent(msg)}`);
    } catch (err) {
      const sep = redirect.includes('?') ? '&' : '?';
      res.redirect(`${redirect}${sep}erro=${encodeURIComponent(err.message)}`);
    }
  }
};

module.exports = superAdminController;
