/**
 * Carteira do organizador — Mercado Pago OAuth (split) ou chave PIX legada.
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const MercadoPagoOAuthService = require('./mercadoPagoOAuthService');
const { chavesPixEquivalentes, validarChavePixPorTipo } = require('../lib/pixKey');
const { ORGANIZADOR_PERCENTUAL, ORGANIZADOR_PERCENTUAL_WOOVI } = require('../lib/config');

const CarteiraService = {
  usesSplit(tenant) {
    return MercadoPagoOAuthService.isSplitConfigured() && MercadoPagoOAuthService.isTenantConnected(tenant);
  },

  async totalSacado(tenantId) {
    const agg = await prisma.saque.aggregate({
      where: {
        tenantId: Number(tenantId),
        status: { in: ['solicitado', 'processando', 'concluido'] }
      },
      _sum: { valorBruto: true }
    });
    return agg._sum.valorBruto || 0;
  },

  async obterResumo(tenantId, tenant = null) {
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
        reservasPendentes: 0,
        totalSacado: 0,
        saldoDisponivel: 0
      };
    }

    const whereBase = { rifaId: { in: rifaIds } };

    const [confirmado, pendente, totalSacado] = await Promise.all([
      prisma.reserva.aggregate({
        where: { ...whereBase, statusPagamento: 'confirmado' },
        _sum: { valorTotal: true },
        _count: { id: true }
      }),
      prisma.reserva.aggregate({
        where: { ...whereBase, statusPagamento: 'pendente' },
        _sum: { valorTotal: true },
        _count: { id: true }
      }),
      this.totalSacado(tenantId)
    ]);

    const saldoConfirmado = confirmado._sum.valorTotal || 0;
    const provider = tenant ? PaymentService.getProvider(tenant) : null;
    const orgPct = provider === 'woovi' ? ORGANIZADOR_PERCENTUAL_WOOVI : ORGANIZADOR_PERCENTUAL;
    const saldoDisponivel = Math.max(0, saldoConfirmado * orgPct - totalSacado);

    const cotasConfirmadas = await prisma.reservaNumero.count({
      where: {
        reserva: { rifaId: { in: rifaIds }, statusPagamento: 'confirmado' }
      }
    });

    return {
      saldoConfirmado,
      pendente: pendente._sum.valorTotal || 0,
      cotasConfirmadas,
      reservasPendentes: pendente._count.id || 0,
      totalSacado,
      saldoDisponivel
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

    // Bloquear apenas se este tenant específico está usando MP direto
    if (MercadoPagoOAuthService.isTenantConnected(tenant)) {
      throw new Error('Sua conta já recebe via Mercado Pago. Para usar chave PIX, desconecte o MP primeiro.');
    }

    await this.assertPixChaveDisponivel(tenantId, pix);

    if (!PaymentService.isPlatformConfigured()) {
      throw new Error('Pagamentos temporariamente indisponíveis. Tente novamente mais tarde.');
    }

    const atualizado = { ...tenant, pixChave: pix };
    await PaymentService.ensureTenantReady(atualizado);

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
