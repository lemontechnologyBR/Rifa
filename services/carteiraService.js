/**
 * Carteira do organizador — PIX via plataforma (Woovi).
 * Saldo sacável = apenas vendas Woovi (exclui legado Mercado Pago).
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const { chavesPixEquivalentes, validarChavePixPorTipo } = require('../lib/pixKey');
const {
  parteOrganizadorReserva,
  isReservaSacavelWoovi,
  classificarReserva
} = require('../lib/carteiraSaldo');

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

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
        parteLegadoMp: 0,
        brutoLegadoMp: 0,
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
          wooviCorrelationId: true,
          _count: { select: { reservaNumeros: true } }
        }
      }),
      prisma.reserva.findMany({
        where: { ...whereBase, statusPagamento: 'pendente' },
        select: { valorTotal: true }
      }),
      this.totalSacado(tenantId)
    ]);

    const woovi = {
      bruto: 0,
      cotas: 0,
      parteOrganizador: 0,
      parteLegadoMp: 0,
      brutoLegadoMp: 0,
      pendente: 0,
      reservasPendentes: 0
    };

    const reservasWoovi = [];

    for (const r of confirmadasList) {
      const valor = Number(r.valorTotal || 0);
      const cotas = r._count.reservaNumeros || 0;
      const parte = parteOrganizadorReserva(r);
      const cls = classificarReserva(r);

      woovi.bruto += valor;
      woovi.cotas += cotas;

      if (cls === 'plataforma') {
        woovi.parteOrganizador += parte;
        reservasWoovi.push(r);
      } else if (cls === 'legado_mp') {
        woovi.parteLegadoMp += parte;
        woovi.brutoLegadoMp += valor;
      }
      // sem_ref: entra no bruto exibido, mas não no saldo sacável
    }

    for (const r of pendentesList) {
      woovi.pendente += Number(r.valorTotal || 0);
      woovi.reservasPendentes++;
    }

    // Sacável = só o que entrou/entra na subconta Woovi
    const saldoTeorico = woovi.parteOrganizador - totalSacado;
    let saldoDisponivel = Math.max(0, saldoTeorico);

    woovi.brutoDisponivel = reservasWoovi.reduce((s, r) => s + Number(r.valorTotal || 0), 0);
    woovi.cotasDisponiveis = reservasWoovi.reduce((s, r) => s + (r._count.reservaNumeros || 0), 0);

    if (totalSacado > 0) {
      const ultimoSaque = await prisma.saque.findFirst({
        where: { tenantId: Number(tenantId), status: { in: ['solicitado', 'processando', 'concluido'] } },
        orderBy: { createdAt: 'desc' }
      });
      if (ultimoSaque) {
        const posteriores = reservasWoovi.filter(
          (r) => new Date(r.createdAt) > ultimoSaque.createdAt
        );
        woovi.brutoDisponivel = posteriores.reduce((soma, r) => soma + Number(r.valorTotal || 0), 0);
        woovi.cotasDisponiveis = posteriores.reduce((soma, r) => soma + (r._count.reservaNumeros || 0), 0);

        if (saldoTeorico < 0) {
          saldoDisponivel = Math.max(
            0,
            posteriores.reduce((soma, r) => soma + parteOrganizadorReserva(r), 0)
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
      saldoDisponivel: round2(saldoDisponivel),
      woovi: {
        ...woovi,
        parteOrganizador: round2(woovi.parteOrganizador),
        parteLegadoMp: round2(woovi.parteLegadoMp),
        brutoLegadoMp: round2(woovi.brutoLegadoMp)
      }
    };
  },

  /** Soma saldos sacáveis (teóricos) — uma passada no banco, sem N+1. */
  async somarSaldosSacaveisPlataforma() {
    const [reservas, saquesPorTenant] = await Promise.all([
      prisma.reserva.findMany({
        where: { statusPagamento: 'confirmado' },
        select: {
          valorTotal: true,
          createdAt: true,
          wooviCorrelationId: true,
          _count: { select: { reservaNumeros: true } },
          rifa: { select: { tenantId: true } }
        }
      }),
      prisma.saque.groupBy({
        by: ['tenantId'],
        where: { status: { in: ['solicitado', 'processando', 'concluido'] } },
        _sum: { valorBruto: true }
      })
    ]);

    const sacadoMap = new Map(
      saquesPorTenant.map((s) => [s.tenantId, Number(s._sum.valorBruto || 0)])
    );
    const parteWooviPorTenant = new Map();

    for (const r of reservas) {
      const tenantId = r.rifa?.tenantId;
      if (!tenantId) continue;
      if (!isReservaSacavelWoovi(r)) continue;
      const parte = parteOrganizadorReserva(r);
      parteWooviPorTenant.set(tenantId, (parteWooviPorTenant.get(tenantId) || 0) + parte);
    }

    let total = 0;
    let comSaldo = 0;
    const tenantIds = new Set([...parteWooviPorTenant.keys(), ...sacadoMap.keys()]);
    for (const tenantId of tenantIds) {
      const parte = parteWooviPorTenant.get(tenantId) || 0;
      const sacado = sacadoMap.get(tenantId) || 0;
      const saldo = Math.max(0, parte - sacado);
      total += saldo;
      if (saldo > 0.009) comSaldo++;
    }

    return {
      saldoSubcontasEstimado: round2(total),
      tenantsComSaldo: comSaldo
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

    return reservas
      .map((r) => r.wooviCorrelationId)
      .filter((id) => id && isReservaSacavelWoovi({ wooviCorrelationId: id }));
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
