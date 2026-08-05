/**
 * Carteira do organizador — PIX via plataforma (Woovi).
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const { chavesPixEquivalentes, validarChavePixPorTipo } = require('../lib/pixKey');
const {
  ORGANIZADOR_PERCENTUAL_WOOVI,
  taxaFixaCotaWooviPara
} = require('../lib/config');

const CarteiraService = {
  usesSplit() {
    return false;
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

  async obterResumo(tenantId) {
    const rifas = await prisma.rifa.findMany({
      where: { tenantId: Number(tenantId) },
      select: { id: true }
    });
    const rifaIds = rifas.map((r) => r.id);
    const vazio = {
      saldoConfirmado: 0,
      pendente: 0,
      cotasConfirmadas: 0,
      reservasPendentes: 0,
      totalSacado: 0,
      saldoDisponivel: 0,
      woovi: {
        bruto: 0,
        cotas: 0,
        brutoDisponivel: 0,
        cotasDisponiveis: 0,
        parteOrganizador: 0,
        saldoSubconta: null,
        pendente: 0,
        reservasPendentes: 0
      }
    };
    if (!rifaIds.length) return vazio;

    const whereBase = { rifaId: { in: rifaIds } };

    const [confirmadasList, pendentesList, totalSacado] = await Promise.all([
      prisma.reserva.findMany({
        where: { ...whereBase, statusPagamento: 'confirmado' },
        select: {
          valorTotal: true,
          createdAt: true,
          _count: { select: { reservaNumeros: true } }
        }
      }),
      prisma.reserva.findMany({
        where: { ...whereBase, statusPagamento: 'pendente' },
        select: { valorTotal: true }
      }),
      this.totalSacado(tenantId)
    ]);

    const woovi = { bruto: 0, cotas: 0, parteOrganizador: 0, pendente: 0, reservasPendentes: 0 };

    for (const r of confirmadasList) {
      const valor = Number(r.valorTotal || 0);
      const cotas = r._count.reservaNumeros || 0;
      woovi.bruto += valor;
      woovi.cotas += cotas;
      const taxaFixa = taxaFixaCotaWooviPara(r.createdAt);
      woovi.parteOrganizador += Math.max(0, valor * ORGANIZADOR_PERCENTUAL_WOOVI - cotas * taxaFixa);
    }

    for (const r of pendentesList) {
      woovi.pendente += Number(r.valorTotal || 0);
      woovi.reservasPendentes++;
    }

    const saldoTeorico = woovi.parteOrganizador - totalSacado;
    let saldoDisponivel = Math.max(0, saldoTeorico);

    woovi.brutoDisponivel = woovi.bruto;
    woovi.cotasDisponiveis = woovi.cotas;

    if (totalSacado > 0) {
      const ultimoSaque = await prisma.saque.findFirst({
        where: { tenantId: Number(tenantId), status: { in: ['solicitado', 'processando', 'concluido'] } },
        orderBy: { createdAt: 'desc' }
      });
      if (ultimoSaque) {
        const posteriores = confirmadasList.filter(
          (r) => new Date(r.createdAt) > ultimoSaque.createdAt
        );
        woovi.brutoDisponivel = posteriores.reduce((soma, r) => soma + Number(r.valorTotal || 0), 0);
        woovi.cotasDisponiveis = posteriores.reduce((soma, r) => soma + (r._count.reservaNumeros || 0), 0);

        if (saldoTeorico < 0) {
          saldoDisponivel = Math.max(
            0,
            posteriores.reduce((soma, r) => {
              const valor = Number(r.valorTotal || 0);
              const cotas = r._count.reservaNumeros || 0;
              return soma + Math.max(0, valor * ORGANIZADOR_PERCENTUAL_WOOVI - cotas * taxaFixaCotaWooviPara(r.createdAt));
            }, 0)
          );
        }
      }
    }

    return {
      saldoConfirmado: woovi.bruto,
      pendente: woovi.pendente,
      cotasConfirmadas: woovi.cotas,
      reservasPendentes: woovi.reservasPendentes,
      totalSacado,
      saldoDisponivel,
      woovi
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

  async _wooviCorrelationIds(tenantId) {
    const rifas = await prisma.rifa.findMany({
      where: { tenantId: Number(tenantId) },
      select: { id: true }
    });
    const rifaIds = rifas.map((r) => r.id);
    if (!rifaIds.length) return [];

    const reservas = await prisma.reserva.findMany({
      where: {
        rifaId: { in: rifaIds },
        statusPagamento: 'confirmado',
        wooviCorrelationId: { not: null }
      },
      select: { wooviCorrelationId: true }
    });

    return reservas.map((r) => r.wooviCorrelationId).filter(Boolean);
  },

  async salvarConfig(tenantId, { pix_chave, pix_tipo }) {
    const pix = validarChavePixPorTipo(pix_tipo, pix_chave);

    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    if (!tenant) throw new Error('Conta não encontrada.');

    await this.assertPixChaveDisponivel(tenantId, pix);

    if (!PaymentService.isPlatformConfigured()) {
      throw new Error('Pagamentos temporariamente indisponíveis. Tente novamente mais tarde.');
    }

    const chaveAntiga = tenant.pixChave;
    const chaveMudou = !!chaveAntiga && !chavesPixEquivalentes(chaveAntiga, pix);
    let saldoMigrado = 0;

    if (chaveMudou) {
      const WooviService = require('./wooviService');
      if (WooviService.isPlatformConfigured()) {
        const refs = await this._wooviCorrelationIds(tenantId);
        const { migrado } = await WooviService.migrarSaldoParaChave(tenant, pix, refs);
        saldoMigrado = migrado;
      }
    }

    await PaymentService.ensureTenantReady({ ...tenant, pixChave: pix });

    const atualizado = await prisma.tenant.update({
      where: { id: Number(tenantId) },
      data: {
        pixChave: pix,
        wooviAtivo: true
      }
    });

    return { tenant: atualizado, saldoMigrado, chaveMudou };
  }
};

module.exports = CarteiraService;
