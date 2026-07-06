/**
 * Carteira do organizador — Mercado Pago OAuth (split) ou chave PIX legada.
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const MercadoPagoOAuthService = require('./mercadoPagoOAuthService');
const { chavesPixEquivalentes, validarChavePixPorTipo } = require('../lib/pixKey');
const { ORGANIZADOR_PERCENTUAL, ORGANIZADOR_PERCENTUAL_WOOVI } = require('../lib/config');

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
        woovi.parteOrganizador += valor * ORGANIZADOR_PERCENTUAL_WOOVI;
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
    let saldoDisponivel = Math.max(0, woovi.parteOrganizador - totalSacado);

    // Saldo real na subconta Woovi (já desconta taxas do gateway por transação)
    if (tenant?.pixChave && saldoDisponivel > 0) {
      const WooviService = require('./wooviService');
      if (WooviService.isPlatformConfigured()) {
        const saldoSubconta = await WooviService.consultarSaldoSubconta(tenant);
        if (saldoSubconta != null) {
          woovi.saldoSubconta = saldoSubconta;
          saldoDisponivel = Math.min(saldoDisponivel, saldoSubconta);
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

  async salvarConfig(tenantId, { pix_chave, pix_tipo }) {
    const pix = validarChavePixPorTipo(pix_tipo, pix_chave);

    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    if (!tenant) throw new Error('Conta não encontrada.');

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
