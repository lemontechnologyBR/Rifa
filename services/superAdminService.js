/**
 * Consultas agregadas para o Super Admin.
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const {
  ORGANIZADOR_PERCENTUAL,
  ORGANIZADOR_PERCENTUAL_WOOVI
} = require('../lib/config');

function paymentInfoForTenant(tenant) {
  const provider = PaymentService.getProvider(tenant);
  if (provider === 'mercadopago') {
    return {
      gateway: 'mercadopago',
      gatewayLabel: 'MP Direto',
      organizadorPercentual: ORGANIZADOR_PERCENTUAL,
      taxaPlataforma: 1 - ORGANIZADOR_PERCENTUAL
    };
  }
  if (provider === 'woovi') {
    return {
      gateway: 'woovi',
      gatewayLabel: 'Plataforma',
      organizadorPercentual: ORGANIZADOR_PERCENTUAL_WOOVI,
      taxaPlataforma: 1 - ORGANIZADOR_PERCENTUAL_WOOVI
    };
  }
  return {
    gateway: null,
    gatewayLabel: 'Não configurado',
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
                  mpUserId: true,
                  mpAccessToken: true,
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

  async listarOrganizadores({ page = 1, limite = 20, busca = '' } = {}) {
    const where = {};
    if (busca && String(busca).trim()) {
      const q = String(busca).trim();
      where.OR = [
        { nome: { contains: q } },
        { email: { contains: q } },
        { tenant: { nome: { contains: q } } },
        { tenant: { slug: { contains: q.toLowerCase() } } }
      ];
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
              pixChave: true,
              mpUserId: true,
              mpAccessToken: true,
              mpConnectedAt: true
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
    let saldoMap = {};

    if (tenantIds.length) {
      const rifas = await prisma.rifa.findMany({
        where: { tenantId: { in: tenantIds } },
        select: {
          tenantId: true,
          reservas: {
            where: { statusPagamento: { in: ['confirmado', 'pendente'] } },
            select: { valorTotal: true, statusPagamento: true }
          }
        }
      });

      for (const rifa of rifas) {
        if (!saldoMap[rifa.tenantId]) saldoMap[rifa.tenantId] = { confirmado: 0, pendente: 0 };
        for (const res of rifa.reservas) {
          if (res.statusPagamento === 'confirmado') saldoMap[rifa.tenantId].confirmado += res.valorTotal;
          else saldoMap[rifa.tenantId].pendente += res.valorTotal;
        }
      }
    }

    let sacadoMap = {};
    if (tenantIds.length) {
      const saques = await prisma.saque.groupBy({
        by: ['tenantId'],
        where: {
          tenantId: { in: tenantIds },
          status: { in: ['solicitado', 'concluido'] }
        },
        _sum: { valorBruto: true }
      });
      for (const s of saques) {
        sacadoMap[s.tenantId] = s._sum.valorBruto || 0;
      }
    }

    const organizadoresComSaldo = organizadores.map(o => {
      const saldo = saldoMap[o.tenant.id] || { confirmado: 0, pendente: 0 };
      const payment = paymentInfoForTenant(o.tenant);
      const totalSacado = sacadoMap[o.tenant.id] || 0;
      const parteBruta = saldo.confirmado * payment.organizadorPercentual;
      const saldoDisponivel = payment.gateway === 'mercadopago'
        ? parteBruta
        : Math.max(0, parteBruta - totalSacado);

      return {
        ...o,
        saldo,
        payment,
        totalSacado,
        saldoDisponivel
      };
    });

    return { organizadores: organizadoresComSaldo, total, paginas: Math.max(1, Math.ceil(total / limite)), page };
  },

  async obterInfoPlataforma() {
    const [totalUsuarios, reservasPendentes, reservasConfirmadas] = await Promise.all([
      prisma.usuario.count(),
      prisma.reserva.count({ where: { statusPagamento: 'pendente' } }),
      prisma.reserva.count({ where: { statusPagamento: 'confirmado' } })
    ]);
    return { totalUsuarios, reservasPendentes, reservasConfirmadas };
  }
};

module.exports = SuperAdminService;
