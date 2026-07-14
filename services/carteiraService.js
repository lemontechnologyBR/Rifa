/**
 * Carteira do organizador — Mercado Pago OAuth (split) ou chave PIX legada.
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const MercadoPagoOAuthService = require('./mercadoPagoOAuthService');
const { chavesPixEquivalentes, validarChavePixPorTipo } = require('../lib/pixKey');
const { ORGANIZADOR_PERCENTUAL, ORGANIZADOR_PERCENTUAL_WOOVI, TAXA_FIXA_COTA_WOOVI } = require('../lib/config');

function gatewayReserva(reserva, tenant) {
  return PaymentService.detectProviderFromRef(reserva?.wooviCorrelationId)
    || PaymentService.getProvider(tenant)
    || 'woovi';
}

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
      },
      mercadopago: {
        bruto: 0,
        cotas: 0,
        parteOrganizador: 0,
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
          wooviCorrelationId: true,
          createdAt: true,
          _count: { select: { reservaNumeros: true } }
        }
      }),
      prisma.reserva.findMany({
        where: { ...whereBase, statusPagamento: 'pendente' },
        select: {
          valorTotal: true,
          wooviCorrelationId: true,
          _count: { select: { reservaNumeros: true } }
        }
      }),
      this.totalSacado(tenantId)
    ]);

    const woovi = { bruto: 0, cotas: 0, parteOrganizador: 0, pendente: 0, reservasPendentes: 0 };
    const mercadopago = { bruto: 0, cotas: 0, parteOrganizador: 0, pendente: 0, reservasPendentes: 0 };

    for (const r of confirmadasList) {
      const valor = Number(r.valorTotal || 0);
      const cotas = r._count.reservaNumeros || 0;
      const gw = gatewayReserva(r, tenant);
      if (gw === 'mercadopago') {
        mercadopago.bruto += valor;
        mercadopago.cotas += cotas;
        mercadopago.parteOrganizador += valor * ORGANIZADOR_PERCENTUAL;
      } else {
        woovi.bruto += valor;
        woovi.cotas += cotas;
        // Taxa Woovi: 5% do valor + R$ 0,50 por cota vendida (descontado do organizador).
        woovi.parteOrganizador += Math.max(0, valor * ORGANIZADOR_PERCENTUAL_WOOVI - cotas * TAXA_FIXA_COTA_WOOVI);
      }
    }

    for (const r of pendentesList) {
      const valor = Number(r.valorTotal || 0);
      const gw = gatewayReserva(r, tenant);
      if (gw === 'mercadopago') {
        mercadopago.pendente += valor;
        mercadopago.reservasPendentes++;
      } else {
        woovi.pendente += valor;
        woovi.reservasPendentes++;
      }
    }

    const saldoConfirmado = woovi.bruto + mercadopago.bruto;
    const pendente = woovi.pendente + mercadopago.pendente;
    const reservasPendentes = woovi.reservasPendentes + mercadopago.reservasPendentes;
    const cotasConfirmadas = woovi.cotas + mercadopago.cotas;

    // Fonte de verdade: banco (reservas confirmadas − saques). Não usa saldo da subconta Woovi.
    const saldoTeorico = woovi.parteOrganizador - totalSacado;
    let saldoDisponivel = Math.max(0, saldoTeorico);

    // "Disponível para exibição": bruto/cotas que ainda não foram sacados. Enquanto não há saque,
    // é igual ao total (nada foi retirado ainda). Após o primeiro saque, considera só as vendas
    // Woovi confirmadas DEPOIS do último saque — evita mostrar valores já sacados como se ainda
    // estivessem disponíveis (ex.: "R$ 25,00 em vendas" quando R$ 14,25 já foi retirado).
    woovi.brutoDisponivel = woovi.bruto;
    woovi.cotasDisponiveis = woovi.cotas;

    if (totalSacado > 0) {
      const ultimoSaque = await prisma.saque.findFirst({
        where: { tenantId: Number(tenantId), status: { in: ['solicitado', 'processando', 'concluido'] } },
        orderBy: { createdAt: 'desc' }
      });
      if (ultimoSaque) {
        const posteriores = confirmadasList.filter(
          (r) => gatewayReserva(r, tenant) !== 'mercadopago' && new Date(r.createdAt) > ultimoSaque.createdAt
        );
        woovi.brutoDisponivel = posteriores.reduce((soma, r) => soma + Number(r.valorTotal || 0), 0);
        woovi.cotasDisponiveis = posteriores.reduce((soma, r) => soma + (r._count.reservaNumeros || 0), 0);

        // Caso raro: saque histórico maior que o total Woovi acumulado até então (ex.: saque feito
        // antes de existir o split Mercado Pago via OAuth, quando fundos de ambos os canais ainda
        // ficavam sob custódia única da plataforma). Em vez de gerar uma "dívida eterna" contra
        // vendas futuras, considera apenas as vendas confirmadas depois do último saque.
        if (saldoTeorico < 0) {
          saldoDisponivel = Math.max(
            0,
            woovi.brutoDisponivel * ORGANIZADOR_PERCENTUAL_WOOVI - woovi.cotasDisponiveis * TAXA_FIXA_COTA_WOOVI
          );
        }
      }
    }

    return {
      saldoConfirmado,
      pendente,
      cotasConfirmadas,
      reservasPendentes,
      totalSacado,
      saldoDisponivel,
      woovi,
      mercadopago
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
      .filter((id) => id && !/^\d+$/.test(String(id)));
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
