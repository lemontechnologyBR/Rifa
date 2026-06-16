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
  }
};

module.exports = LogService;
