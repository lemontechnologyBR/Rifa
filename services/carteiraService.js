/**
 * Carteira do organizador — chave PIX para recebimentos via Woovi (plataforma).
 */
const prisma = require('../lib/prisma');
const WooviService = require('./wooviService');
const { chavesPixEquivalentes, validarChavePixPorTipo } = require('../lib/pixKey');

const CarteiraService = {
  async obterResumo(tenantId) {
    const rifas = await prisma.rifa.findMany({
      where: { tenantId: Number(tenantId) },
      select: { id: true }
    });
    const rifaIds = rifas.map((r) => r.id);
    if (!rifaIds.length) {
      return {
        saldoConfirmado: 0,
        pendente: 0,
        cotasConfirmadas: 0,
        reservasPendentes: 0
      };
    }

    const whereBase = { rifaId: { in: rifaIds } };

    const [confirmado, pendente] = await Promise.all([
      prisma.reserva.aggregate({
        where: { ...whereBase, statusPagamento: 'confirmado' },
        _sum: { valorTotal: true },
        _count: { id: true }
      }),
      prisma.reserva.aggregate({
        where: { ...whereBase, statusPagamento: 'pendente' },
        _sum: { valorTotal: true },
        _count: { id: true }
      })
    ]);

    const cotasConfirmadas = await prisma.reservaNumero.count({
      where: {
        reserva: { rifaId: { in: rifaIds }, statusPagamento: 'confirmado' }
      }
    });

    return {
      saldoConfirmado: confirmado._sum.valorTotal || 0,
      pendente: pendente._sum.valorTotal || 0,
      cotasConfirmadas,
      reservasPendentes: pendente._count.id || 0
    };
  },

  async assertPixChaveDisponivel(tenantId, pixChave) {
    const outros = await prisma.tenant.findMany({
      where: {
        id: { not: Number(tenantId) },
        pixChave: { not: null }
      },
      select: { id: true, slug: true, nome: true, pixChave: true }
    }).then((rows) => rows.filter((t) => String(t.pixChave || '').trim()));

    const duplicado = outros.find((t) => chavesPixEquivalentes(t.pixChave, pixChave));
    if (duplicado) {
      throw new Error(
        `Esta chave PIX já está cadastrada no sistema "${duplicado.nome}" (/${duplicado.slug}). Cada loja precisa de uma chave exclusiva.`
      );
    }
  },

  async salvarConfig(tenantId, { pix_chave, pix_tipo }) {
    const pix = validarChavePixPorTipo(pix_tipo, pix_chave);

    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    if (!tenant) throw new Error('Conta não encontrada.');

    await this.assertPixChaveDisponivel(tenantId, pix);

    if (!WooviService.isPlatformConfigured()) {
      throw new Error('Pagamentos temporariamente indisponíveis. Tente novamente mais tarde.');
    }

    const atualizado = { ...tenant, pixChave: pix };
    await WooviService.ensureSubconta(atualizado);

    return prisma.tenant.update({
      where: { id: Number(tenantId) },
      data: {
        pixChave: pix,
        wooviAtivo: true
      }
    });
  }
};

module.exports = CarteiraService;
