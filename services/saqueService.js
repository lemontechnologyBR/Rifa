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
      valorBruto: podeSacar ? saldo : 0,
      valorLiquido: podeSacar ? saldoLiquido : 0,
      saqueGratisMin: SAQUE_GRATIS_MIN,
      saqueMinimo: SAQUE_MINIMO
    };
  },

  calcularResumoValor(saldoDisponivel, valorBruto) {
    const saldo = Math.max(0, Number(saldoDisponivel) || 0);
    const valor = Math.round(Number(valorBruto) * 100) / 100;
    const saqueGratis = saldo >= SAQUE_GRATIS_MIN;
    const taxa = saqueGratis ? 0 : TAXA_SAQUE;
    const podeSacar = saldo >= SAQUE_MINIMO;

    if (!podeSacar) {
      throw new Error(
        `Saldo insuficiente. Mínimo para saque: R$ ${SAQUE_MINIMO.toFixed(2).replace('.', ',')}. ` +
        `Disponível: R$ ${saldo.toFixed(2).replace('.', ',')}.`
      );
    }
    if (valor < SAQUE_MINIMO) {
      throw new Error(`Valor mínimo por saque: R$ ${SAQUE_MINIMO.toFixed(2).replace('.', ',')}.`);
    }
    if (valor > saldo + 0.009) {
      throw new Error(
        `Valor acima do saldo disponível (R$ ${saldo.toFixed(2).replace('.', ',')}).`
      );
    }
    if (taxa > 0 && valor <= taxa) {
      throw new Error('Valor insuficiente para cobrir a taxa de saque.');
    }

    const valorLiquido = Math.round((valor - taxa) * 100) / 100;

    return {
      saldoDisponivel: saldo,
      valorBruto: valor,
      saqueGratis,
      taxa,
      podeSacar,
      valorLiquido,
      saldoLiquido: valorLiquido,
      saqueGratisMin: SAQUE_GRATIS_MIN,
      saqueMinimo: SAQUE_MINIMO
    };
  },

  async listarPorTenant(tenantId, limit = 20) {
    return prisma.saque.findMany({
      where: { tenantId: Number(tenantId) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Number(limit) || 20, 1), 100)
    });
  },

  async processarSaque(tenant, saldoDisponivel, adminUsuario, valorBruto = null) {
    const MercadoPagoOAuthService = require('./mercadoPagoOAuthService');
    if (MercadoPagoOAuthService.isSplitConfigured() && MercadoPagoOAuthService.isTenantConnected(tenant)) {
      throw new Error('Com Mercado Pago conectado, os pagamentos caem direto na sua conta — não é necessário sacar.');
    }

    const resumo = valorBruto != null && valorBruto !== ''
      ? this.calcularResumoValor(saldoDisponivel, valorBruto)
      : this.calcularResumo(saldoDisponivel);

    if (!resumo.podeSacar) {
      throw new Error(
        `Saldo insuficiente. Mínimo para saque: R$ ${SAQUE_MINIMO.toFixed(2).replace('.', ',')}. ` +
        `Disponível: R$ ${resumo.saldoDisponivel.toFixed(2).replace('.', ',')}.`
      );
    }

    if (resumo.taxa > 0 && resumo.valorBruto <= resumo.taxa) {
      throw new Error('Saldo insuficiente para cobrir a taxa de saque.');
    }

    const provider = PaymentService.getProvider(tenant);

    if (provider === 'woovi') {
      const WooviService = require('./wooviService');
      if (resumo.taxa > 0) {
        await WooviService.debitarSubconta(tenant, resumo.taxa, 'Taxa de saque VouRifar');
      }
      const tx = await WooviService.sacarSubconta(tenant, resumo.valorLiquido);
      const statusPix = String(tx?.status || 'CREATED').toUpperCase();
      const statusDb = ['COMPLETED', 'CONFIRMED', 'SUCCESS'].includes(statusPix) ? 'concluido' : 'processando';

      const saque = await prisma.saque.create({
        data: {
          tenantId: tenant.id,
          valorBruto: resumo.valorBruto,
          taxa: resumo.taxa,
          valorLiquido: resumo.valorLiquido,
          status: statusDb
        }
      });

      await LogService.registrar(
        adminUsuario,
        'saque_carteira',
        `Saque PIX Woovi #${saque.id} — R$ ${resumo.valorLiquido.toFixed(2)} (taxa R$ ${resumo.taxa.toFixed(2)})`,
        tenant.id
      );
      return { ...tx, saqueId: saque.id, resumo };
    }

    const saque = await prisma.saque.create({
      data: {
        tenantId: tenant.id,
        valorBruto: resumo.valorBruto,
        taxa: resumo.taxa,
        valorLiquido: resumo.valorLiquido,
        status: 'solicitado'
      }
    });

    console.log(
      `[Saque] Tenant #${tenant.id} (${tenant.slug}) — R$ ${resumo.valorLiquido.toFixed(2)} ` +
      `→ PIX ${tenant.pixChave} (saque #${saque.id})`
    );

    await LogService.registrar(
      adminUsuario,
      'saque_carteira',
      `Saque solicitado #${saque.id} — taxa R$ ${resumo.taxa.toFixed(2)}, líquido R$ ${resumo.valorLiquido.toFixed(2)}`,
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
