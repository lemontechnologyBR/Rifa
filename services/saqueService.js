/**
 * Regras e processamento de saque do organizador.
 */
const prisma = require('../lib/prisma');
const PaymentService = require('./paymentService');
const LogService = require('./logService');
const {
  SAQUE_GRATIS_MIN,
  TAXA_SAQUE,
  SAQUE_MINIMO
} = require('../lib/config');

const SaqueService = {
  calcularResumo(saldoDisponivel) {
    const saldo = Math.max(0, Number(saldoDisponivel) || 0);
    const saqueGratis = saldo >= SAQUE_GRATIS_MIN;
    const taxa = saqueGratis ? 0 : TAXA_SAQUE;
    const podeSacar = saldo >= SAQUE_MINIMO;
    const saldoLiquido = podeSacar ? Math.max(0, saldo - taxa) : 0;

    return {
      saldoDisponivel: saldo,
      saqueGratis,
      taxa,
      podeSacar,
      saldoLiquido,
      saqueGratisMin: SAQUE_GRATIS_MIN,
      saqueMinimo: SAQUE_MINIMO
    };
  },

  async processarSaque(tenant, saldoDisponivel, adminUsuario) {
    const MercadoPagoOAuthService = require('./mercadoPagoOAuthService');
    if (MercadoPagoOAuthService.isSplitConfigured() && MercadoPagoOAuthService.isTenantConnected(tenant)) {
      throw new Error('Com Mercado Pago conectado, os pagamentos caem direto na sua conta — não é necessário sacar.');
    }

    const resumo = this.calcularResumo(saldoDisponivel);

    if (!resumo.podeSacar) {
      throw new Error(
        `Saldo insuficiente. Mínimo para saque: R$ ${SAQUE_MINIMO.toFixed(2).replace('.', ',')}. ` +
        `Disponível: R$ ${resumo.saldoDisponivel.toFixed(2).replace('.', ',')}.`
      );
    }

    if (resumo.taxa > 0 && resumo.saldoDisponivel <= resumo.taxa) {
      throw new Error('Saldo insuficiente para cobrir a taxa de saque.');
    }

    const provider = PaymentService.getProvider();

    if (provider === 'woovi') {
      const WooviService = require('./wooviService');
      if (resumo.taxa > 0) {
        await WooviService.debitarSubconta(tenant, resumo.taxa, 'Taxa de saque VouRifar');
      }
      const tx = await WooviService.sacarSubconta(tenant);
      await LogService.registrar(
        adminUsuario,
        'saque_carteira',
        `Saque PIX Woovi — taxa R$ ${resumo.taxa.toFixed(2)}, líquido ~R$ ${resumo.saldoLiquido.toFixed(2)}`,
        tenant.id
      );
      return { ...tx, resumo };
    }

    const saque = await prisma.saque.create({
      data: {
        tenantId: tenant.id,
        valorBruto: resumo.saldoDisponivel,
        taxa: resumo.taxa,
        valorLiquido: resumo.saldoLiquido,
        status: 'solicitado'
      }
    });

    console.log(
      `[Saque] Tenant #${tenant.id} (${tenant.slug}) — R$ ${resumo.saldoLiquido.toFixed(2)} ` +
      `→ PIX ${tenant.pixChave} (saque #${saque.id})`
    );

    await LogService.registrar(
      adminUsuario,
      'saque_carteira',
      `Saque solicitado #${saque.id} — taxa R$ ${resumo.taxa.toFixed(2)}, líquido R$ ${resumo.saldoLiquido.toFixed(2)}`,
      tenant.id
    );

    return {
      status: 'SOLICITADO',
      saqueId: saque.id,
      resumo
    };
  }
};

module.exports = SaqueService;
