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

  _statusPagamentoConfirmado(status) {
    const s = String(status || '').toUpperCase();
    return ['CONFIRMED', 'COMPLETED', 'APPROVED', 'SUCCESS'].includes(s);
  },

  _statusPagamentoFalhou(status) {
    const s = String(status || '').toUpperCase();
    return ['FAILED', 'CANCELLED', 'CANCELED', 'REMOVED'].includes(s);
  },

  async marcarConcluido(correlationID, endToEndId = null) {
    if (!correlationID) return null;
    const saque = await prisma.saque.findFirst({ where: { correlationId: correlationID } });
    if (!saque || saque.status === 'concluido') return saque;

    const atualizado = await prisma.saque.update({
      where: { id: saque.id },
      data: {
        status: 'concluido',
        endToEndId: endToEndId || saque.endToEndId,
        erroMsg: null
      }
    });
    console.log(`[Saque] #${saque.id} concluído — correlationID=${correlationID}`);
    return atualizado;
  },

  async marcarFalhou(correlationID, erroMsg = 'Falha no PIX Out') {
    if (!correlationID) return null;
    const saque = await prisma.saque.findFirst({ where: { correlationId: correlationID } });
    if (!saque || saque.status === 'falhou') return saque;

    const atualizado = await prisma.saque.update({
      where: { id: saque.id },
      data: {
        status: 'falhou',
        erroMsg: String(erroMsg || 'Falha no PIX Out').slice(0, 500)
      }
    });
    console.log(`[Saque] #${saque.id} falhou — ${erroMsg}`);
    return atualizado;
  },

  async processarEventoWoovi(body) {
    const event = String(body?.event || body?.type || '').toUpperCase();
    const WooviService = require('./wooviService');
    const correlationID = WooviService.extrairCorrelationMovimento(body);
    if (!correlationID) {
      console.warn('[Saque] Webhook movimento sem correlationID');
      return null;
    }

    if (event.includes('MOVEMENT_CONFIRMED')) {
      return this.marcarConcluido(correlationID, body?.transaction?.endToEndId || null);
    }
    if (event.includes('MOVEMENT_FAILED')) {
      const msg = body?.error?.description || body?.error?.code || 'Falha no PIX Out';
      return this.marcarFalhou(correlationID, msg);
    }
    if (event.includes('MOVEMENT_REMOVED')) {
      return this.marcarFalhou(correlationID, 'Pagamento cancelado/removido');
    }
    return null;
  },

  async sincronizarPendentes() {
    const WooviService = require('./wooviService');
    if (!WooviService.isPlatformConfigured()) return 0;

    const pendentes = await prisma.saque.findMany({
      where: { status: 'processando' },
      orderBy: { createdAt: 'asc' },
      take: 30
    });
    if (!pendentes.length) return 0;

    let atualizados = 0;

    for (const saque of pendentes) {
      try {
        if (saque.correlationId) {
          const data = await WooviService.consultarPagamento(saque.correlationId);
          const payment = data?.payment || data;
          const st = payment?.status;
          if (this._statusPagamentoConfirmado(st)) {
            await this.marcarConcluido(saque.correlationId, data?.transaction?.endToEndId);
            atualizados++;
            continue;
          }
          if (this._statusPagamentoFalhou(st)) {
            await this.marcarFalhou(saque.correlationId, 'PIX Out rejeitado pela Woovi');
            atualizados++;
          }
          continue;
        }

        // Saque antigo sem correlationID — tenta casar por valor e horário
        const valorCentavos = Math.round(saque.valorLiquido * 100);
        const pagamentos = await WooviService.listarPagamentos(50);
        const criado = saque.createdAt.getTime();
        const match = pagamentos.find((row) => {
          const p = row?.payment || row;
          if (!p?.correlationID) return false;
          const pv = Number(p.value || 0);
          if (pv !== valorCentavos) return false;
          const t = p.createdAt || p.time || p.updatedAt;
          if (!t) return true;
          const diff = Math.abs(new Date(t).getTime() - criado);
          return diff < 6 * 60 * 60 * 1000;
        });

        if (!match) continue;

        const p = match.payment || match;
        await prisma.saque.update({
          where: { id: saque.id },
          data: { correlationId: p.correlationID }
        });

        if (this._statusPagamentoConfirmado(p.status)) {
          await this.marcarConcluido(p.correlationID, match?.transaction?.endToEndId);
          atualizados++;
        } else if (this._statusPagamentoFalhou(p.status)) {
          await this.marcarFalhou(p.correlationID, 'PIX Out rejeitado pela Woovi');
          atualizados++;
        }
      } catch (err) {
        console.error(`[SyncSaque] #${saque.id}:`, err.message);
      }
    }

    if (atualizados > 0) {
      console.log(`[SyncSaque] ${atualizados} saque(s) atualizado(s).`);
    }
    return atualizados;
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
      const statusDb = this._statusPagamentoConfirmado(statusPix) ? 'concluido' : 'processando';

      const saque = await prisma.saque.create({
        data: {
          tenantId: tenant.id,
          valorBruto: resumo.valorBruto,
          taxa: resumo.taxa,
          valorLiquido: resumo.valorLiquido,
          status: statusDb,
          correlationId: tx?.correlationID || null,
          endToEndId: tx?.endToEndId || null
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
