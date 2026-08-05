/**
 * Consultas agregadas para o Super Admin.
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const {
  ORGANIZADOR_PERCENTUAL_WOOVI,
  taxaFixaCotaWooviPara
} = require('../lib/config');
const { isReservaSacavelWoovi } = require('../lib/carteiraSaldo');

function paymentInfoForTenant(tenant) {
  const provider = PaymentService.getProvider(tenant);
  if (provider === 'woovi') {
    return {
      gateway: 'woovi',
      gatewayLabel: 'PIX plataforma',
      organizadorPercentual: ORGANIZADOR_PERCENTUAL_WOOVI,
      taxaPlataforma: 1 - ORGANIZADOR_PERCENTUAL_WOOVI
    };
  }
  return {
    gateway: null,
    gatewayLabel: 'PIX pendente',
    organizadorPercentual: ORGANIZADOR_PERCENTUAL_WOOVI,
    taxaPlataforma: 1 - ORGANIZADOR_PERCENTUAL_WOOVI
  };
}

const SuperAdminService = {
  async listarRifas({ page = 1, limite = 15, busca = '', status = 'todos' } = {}) {
    const where = {};
    if (status && status !== 'todos') where.status = status;
    if (busca && String(busca).trim()) {
      const q = String(busca).trim();
      where.OR = [
        { titulo: { contains: q } },
        { tenant: { nome: { contains: q } } },
        { tenant: { slug: { contains: q.toLowerCase() } } }
      ];
    }

    const [rifas, total] = await Promise.all([
      prisma.rifa.findMany({
        where,
        include: {
          tenant: { select: { id: true, nome: true, slug: true, status: true } },
          _count: { select: { reservas: true, numeros: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limite,
        take: limite
      }),
      prisma.rifa.count({ where })
    ]);

    return { rifas, total, paginas: Math.max(1, Math.ceil(total / limite)), page };
  },

  async listarVendas({ page = 1, limite = 20, status = 'todos' } = {}) {
    const where = {};
    if (status === 'confirmado' || status === 'pendente') {
      where.statusPagamento = status;
    }

    const [vendas, total] = await Promise.all([
      prisma.reserva.findMany({
        where,
        include: {
          usuario: { select: { nome: true, email: true, telefone: true } },
          rifa: {
            select: {
              titulo: true,
              tenant: {
                select: {
                  nome: true,
                  slug: true,
                  pixChave: true
                }
              }
            }
          },
          _count: { select: { reservaNumeros: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limite,
        take: limite
      }),
      prisma.reserva.count({ where })
    ]);

    return { vendas, total, paginas: Math.max(1, Math.ceil(total / limite)), page };
  },

  async listarOrganizadores({ page = 1, limite = 20, busca = '', filtro = '', status = 'todos' } = {}) {
    if (filtro === 'leads_quentes') {
      const OnboardingEmailService = require('./onboardingEmailService');
      const leads = await OnboardingEmailService.listarLeadsQuentes();
      let filtrados = leads;
      if (busca && String(busca).trim()) {
        const q = String(busca).trim().toLowerCase();
        filtrados = leads.filter((o) =>
          o.nome.toLowerCase().includes(q)
          || o.email.toLowerCase().includes(q)
          || o.tenant.nome.toLowerCase().includes(q)
          || o.tenant.slug.toLowerCase().includes(q)
          || String(o.tenant.pixChave || '').toLowerCase().includes(q)
        );
      }
      if (status && status !== 'todos') {
        filtrados = filtrados.filter((o) => o.tenant.status === status);
      }
      const total = filtrados.length;
      const slice = filtrados.slice((page - 1) * limite, page * limite);
      const tenantIds = slice.map((o) => o.tenant.id);
      const saldoMap = await this._saldoPorTenants(tenantIds);
      const sacadoMap = await this._sacadoPorTenants(tenantIds);

      const organizadores = slice.map((o) => {
        const saldo = saldoMap[o.tenant.id] || { confirmado: 0, pendente: 0, parteOrganizadorWoovi: 0 };
        const payment = paymentInfoForTenant(o.tenant);
        const totalSacado = sacadoMap[o.tenant.id] || 0;
        const saldoDisponivel = Math.max(0, saldo.parteOrganizadorWoovi - totalSacado);
        return {
          ...o,
          tenant: { ...o.tenant, _count: { rifas: 0 } },
          saldo,
          payment,
          totalSacado,
          saldoDisponivel,
          totalRifas: 0,
          carteiraOk: true,
          diasCadastro: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000),
          leadQuente: true
        };
      });

      return {
        organizadores,
        total,
        paginas: Math.max(1, Math.ceil(total / limite)),
        page
      };
    }

    const tenantWhere = {};
    if (status && status !== 'todos') tenantWhere.status = status;
    if (filtro === 'sem_rifa') tenantWhere.rifas = { none: {} };
    if (filtro === 'sem_carteira') {
      tenantWhere.pixChave = null;
    }

    const where = {};
    if (busca && String(busca).trim()) {
      const q = String(busca).trim();
      const orClause = [
        { nome: { contains: q } },
        { email: { contains: q } },
        { tenant: { nome: { contains: q } } },
        { tenant: { slug: { contains: q.toLowerCase() } } },
        { tenant: { pixChave: { contains: q } } }
      ];
      if (Object.keys(tenantWhere).length) {
        where.AND = [{ tenant: tenantWhere }, { OR: orClause }];
      } else {
        where.OR = orClause;
      }
    } else if (Object.keys(tenantWhere).length) {
      where.tenant = tenantWhere;
    }

    const [organizadores, total] = await Promise.all([
      prisma.organizador.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              nome: true,
              slug: true,
              status: true,
              createdAt: true,
              pixChave: true,
              wooviAtivo: true,
              _count: { select: { rifas: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limite,
        take: limite
      }),
      prisma.organizador.count({ where })
    ]);

    // Calcular saldo confirmado e pendente por tenant
    const tenantIds = organizadores.map(o => o.tenant.id);
    const saldoMap = await this._saldoPorTenants(tenantIds);
    const sacadoMap = await this._sacadoPorTenants(tenantIds);

    const organizadoresComSaldo = organizadores.map(o => {
      const saldo = saldoMap[o.tenant.id] || { confirmado: 0, pendente: 0, parteOrganizadorWoovi: 0 };
      const payment = paymentInfoForTenant(o.tenant);
      const totalSacado = sacadoMap[o.tenant.id] || 0;
      const saldoDisponivel = Math.max(0, saldo.parteOrganizadorWoovi - totalSacado);
      const totalRifas = o.tenant._count?.rifas ?? 0;
      const carteiraOk = payment.gateway === 'woovi';
      const diasCadastro = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000);
      const leadQuente = totalRifas === 0 && carteiraOk && diasCadastro >= 5 && !o.campanhaLeadsSentAt;

      return {
        ...o,
        saldo,
        payment,
        totalSacado,
        saldoDisponivel,
        totalRifas,
        carteiraOk,
        diasCadastro,
        leadQuente
      };
    });

    return {
      organizadores: organizadoresComSaldo,
      total,
      paginas: Math.max(1, Math.ceil(total / limite)),
      page
    };
  },

  async _saldoPorTenants(tenantIds) {
    const saldoMap = {};
    if (!tenantIds.length) return saldoMap;

    const emptySaldo = () => ({
      confirmado: 0,
      pendente: 0,
      parteOrganizadorWoovi: 0
    });

    const rifas = await prisma.rifa.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        tenantId: true,
        reservas: {
          where: { statusPagamento: { in: ['confirmado', 'pendente'] } },
          select: {
            valorTotal: true,
            statusPagamento: true,
            createdAt: true,
            _count: { select: { reservaNumeros: true } }
          }
        }
      }
    });

    for (const rifa of rifas) {
      if (!saldoMap[rifa.tenantId]) saldoMap[rifa.tenantId] = emptySaldo();
      for (const res of rifa.reservas) {
        const valor = Number(res.valorTotal || 0);
        const cotas = res._count?.reservaNumeros || 0;
        if (res.statusPagamento === 'confirmado') {
          saldoMap[rifa.tenantId].confirmado += valor;
          const taxaFixa = taxaFixaCotaWooviPara(res.createdAt);
          saldoMap[rifa.tenantId].parteOrganizadorWoovi += Math.max(
            0,
            valor * ORGANIZADOR_PERCENTUAL_WOOVI - cotas * taxaFixa
          );
        } else {
          saldoMap[rifa.tenantId].pendente += valor;
        }
      }
    }
    return saldoMap;
  },

  async _sacadoPorTenants(tenantIds) {
    const sacadoMap = {};
    if (!tenantIds.length) return sacadoMap;

    const saques = await prisma.saque.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: tenantIds },
        status: { in: ['solicitado', 'processando', 'concluido'] }
      },
      _sum: { valorBruto: true }
    });
    for (const s of saques) {
      sacadoMap[s.tenantId] = s._sum.valorBruto || 0;
    }
    return sacadoMap;
  },

  async contarLeadsQuentes() {
    const OnboardingEmailService = require('./onboardingEmailService');
    const leads = await OnboardingEmailService.listarLeadsQuentes();
    return leads.length;
  },

  async obterInfoPlataforma() {
    const [
      totalUsuarios,
      reservasPendentes,
      reservasConfirmadas,
      reservasExpiradas,
      rifasFinalizadas,
      rifasCanceladas,
      tenantsWoovi,
      saquesResumo,
      reservasMesLista,
      saquesMes
    ] = await Promise.all([
      prisma.usuario.count(),
      prisma.reserva.count({ where: { statusPagamento: 'pendente' } }),
      prisma.reserva.count({ where: { statusPagamento: 'confirmado' } }),
      prisma.reserva.count({ where: { statusPagamento: 'expirado' } }),
      prisma.rifa.count({ where: { status: 'finalizada' } }),
      prisma.rifa.count({ where: { status: 'cancelada' } }),
      prisma.tenant.count({ where: { pixChave: { not: null }, status: 'ativo' } }),
      prisma.saque.aggregate({
        _sum: { valorLiquido: true, valorBruto: true, taxa: true },
        _count: { id: true },
        where: { status: 'concluido' }
      }),
      prisma.reserva.findMany({
        where: {
          statusPagamento: 'confirmado',
          wooviCorrelationId: { not: null },
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        },
        select: {
          valorTotal: true,
          wooviCorrelationId: true
        }
      }),
      prisma.saque.aggregate({
        _sum: { taxa: true },
        _count: { id: true },
        where: {
          status: 'concluido',
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }
      })
    ]);

    const saquesPendentes = await prisma.saque.aggregate({
      _sum: { valorLiquido: true },
      _count: { id: true },
      where: { status: { in: ['solicitado', 'processando'] } }
    });

    const reservasMesWoovi = reservasMesLista.filter(isReservaSacavelWoovi);
    const gmvMesValor = reservasMesWoovi.reduce((s, r) => s + Number(r.valorTotal || 0), 0);

    const totalSacadoLiquido = saquesResumo._sum.valorLiquido || 0;
    const totalSacadoBruto = saquesResumo._sum.valorBruto || 0;
    const totalTaxasSaque = Number(saquesResumo._sum.taxa || 0) || Math.max(0, totalSacadoBruto - totalSacadoLiquido);
    const taxasSaqueMes = Number(saquesMes._sum.taxa || 0);

    return {
      totalUsuarios,
      reservasPendentes,
      reservasConfirmadas,
      reservasExpiradas,
      rifasFinalizadas,
      rifasCanceladas,
      tenantsWoovi,
      totalSacadoLiquido,
      totalSacadoBruto,
      totalTaxasSaque,
      taxasSaqueMes,
      countSaquesConcluidos: saquesResumo._count.id || 0,
      countSaquesMes: saquesMes._count.id || 0,
      totalSaquesPendenteValor: saquesPendentes._sum.valorLiquido || 0,
      countSaquesPendentes: saquesPendentes._count.id || 0,
      gmvMes: gmvMesValor,
      vendasMes: reservasMesWoovi.length
    };
  },

  async listarSaques({ page = 1, limite = 25, status = 'todos', busca = '' } = {}) {
    const where = {};
    if (status !== 'todos') where.status = status;
    if (busca) {
      where.tenant = {
        OR: [
          { nome: { contains: busca } },
          { slug: { contains: busca } }
        ]
      };
    }

    const [saques, total] = await Promise.all([
      prisma.saque.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              nome: true,
              slug: true,
              organizadores: { select: { email: true }, take: 1 }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limite,
        take: limite
      }),
      prisma.saque.count({ where })
    ]);

    return {
      saques,
      total,
      page,
      paginas: Math.max(1, Math.ceil(total / limite))
    };
  },

  async resumoSaques() {
    const [totais, pendentes] = await Promise.all([
      prisma.saque.aggregate({
        _sum: { valorLiquido: true, valorBruto: true, taxa: true },
        _count: { id: true },
        where: { status: 'concluido' }
      }),
      prisma.saque.aggregate({
        _sum: { valorLiquido: true },
        _count: { id: true },
        where: { status: { in: ['solicitado', 'processando'] } }
      })
    ]);

    const totalConcluido = totais._sum.valorLiquido || 0;
    const totalBruto = totais._sum.valorBruto || 0;
    const totalTaxas = Number(totais._sum.taxa || 0) || Math.max(0, totalBruto - totalConcluido);

    return {
      totalConcluido,
      totalBruto,
      totalTaxas,
      countConcluido: totais._count.id || 0,
      totalPendente: pendentes._sum.valorLiquido || 0,
      countPendente: pendentes._count.id || 0
    };
  }
};

module.exports = SuperAdminService;
