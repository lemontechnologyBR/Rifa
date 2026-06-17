/**
 * Consultas agregadas para o Super Admin.
 */
const prisma = require('../lib/prisma');

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
              tenant: { select: { nome: true, slug: true } }
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
          tenant: { select: { id: true, nome: true, slug: true, status: true, pixChave: true } }
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

    const organizadoresComSaldo = organizadores.map(o => ({
      ...o,
      saldo: saldoMap[o.tenant.id] || { confirmado: 0, pendente: 0 }
    }));

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
