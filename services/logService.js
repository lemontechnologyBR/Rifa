/**
 * Serviço de log de atividades.
 */
const prisma = require('../lib/prisma');

const LogService = {
  async registrar(adminUsuario, acao, detalhes = null, tenantId = null) {
    return prisma.logAdmin.create({
      data: { adminUsuario, acao, detalhes, tenantId: tenantId ? Number(tenantId) : null }
    });
  },

  async listar(limite = 50, tenantId = null) {
    const where = tenantId ? { tenantId: Number(tenantId) } : {};
    return prisma.logAdmin.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limite
    });
  },

  /**
   * Lista paginada (Super Admin / auditoria).
   * @param {{ page?: number, limite?: number, tenantId?: number|null, acao?: string, busca?: string }} opts
   */
  async listarPaginado({ page = 1, limite = 50, tenantId = null, acao = '', busca = '' } = {}) {
    const where = {};
    if (tenantId) where.tenantId = Number(tenantId);
    if (acao && String(acao).trim()) where.acao = String(acao).trim();
    if (busca && String(busca).trim()) {
      const q = String(busca).trim();
      where.OR = [
        { detalhes: { contains: q } },
        { adminUsuario: { contains: q } },
        { acao: { contains: q } }
      ];
    }

    const p = Math.max(1, Number(page) || 1);
    const take = Math.min(100, Math.max(10, Number(limite) || 50));

    const [logs, total] = await Promise.all([
      prisma.logAdmin.findMany({
        where,
        include: {
          tenant: { select: { id: true, nome: true, slug: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * take,
        take
      }),
      prisma.logAdmin.count({ where })
    ]);

    return {
      logs,
      total,
      page: p,
      paginas: Math.max(1, Math.ceil(total / take)),
      limite: take
    };
  }
};

module.exports = LogService;
