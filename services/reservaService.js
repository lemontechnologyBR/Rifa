/**
 * Serviço de reservas e pagamentos.
 */

const prisma = require('../lib/prisma');
const { gerarPayloadPix } = require('../lib/helpers');
const { reservaExpirada, obterExpiraEmReserva } = require('../lib/reservaConfig');
const LogService = require('./logService');
const IndicacaoService = require('./indicacaoService');
const PaymentService = require('./paymentService');
const { enviarEmail } = require('../lib/emailService');
const {
  templateReservaCriada,
  templatePagamentoConfirmado,
  templateReservaExpirada,
  templateVendaOrganizador,
  templateNovaCompraOrganizador
} = require('../lib/emailTemplates');
const { notificarOrganizadores } = require('../lib/organizadorEmail');

const ReservaService = {
  async expirarSeNecessario(reservaId) {
    const reserva = await prisma.reserva.findUnique({ where: { id: Number(reservaId) } });
    if (!reserva || reserva.statusPagamento !== 'pendente') return reserva;
    if (!reservaExpirada(reserva)) return reserva;
    return this._expirarInterno(reserva.id);
  },

  async limparExpiradas(tenantId = null, rifaId = null) {
    const where = {
      statusPagamento: 'pendente',
      ...(tenantId ? { rifa: { tenantId: Number(tenantId) } } : {}),
      ...(rifaId ? { rifaId: Number(rifaId) } : {})
    };
    const pendentes = await prisma.reserva.findMany({ where, select: { id: true, expiraEm: true, createdAt: true, statusPagamento: true } });
    let total = 0;
    for (const r of pendentes) {
      if (reservaExpirada(r)) {
        await this._expirarInterno(r.id);
        total++;
      }
    }
    return total;
  },

  async _expirarInterno(reservaId) {
    const resultado = await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findUnique({ where: { id: Number(reservaId) } });
      if (!reserva || reserva.statusPagamento !== 'pendente') return reserva;

      await tx.reserva.update({
        where: { id: reserva.id },
        data: { statusPagamento: 'expirado' }
      });

      const vinculos = await tx.reservaNumero.findMany({ where: { reservaId: reserva.id } });
      for (const v of vinculos) {
        await tx.numero.update({
          where: { id: v.numeroId },
          data: { status: 'disponivel', usuarioId: null, reservadoAte: null }
        });
      }

      return { ...reserva, statusPagamento: 'expirado' };
    });

    // Envia email de expiração em background (não bloqueia)
    setImmediate(async () => {
      try {
        const reservaFull = await prisma.reserva.findUnique({
          where: { id: Number(reservaId) },
          include: {
            usuario: true,
            rifa: { include: { tenant: true } },
            reservaNumeros: { include: { numero: true } }
          }
        });
        if (reservaFull?.usuario?.email && reservaFull.rifa) {
          const numeros = reservaFull.reservaNumeros.map(rn => rn.numero.numero);
          await enviarEmail({
            para: reservaFull.usuario.email,
            assunto: `Sua reserva na rifa "${reservaFull.rifa.titulo}" expirou`,
            html: templateReservaExpirada({
              usuario: reservaFull.usuario,
              rifa: reservaFull.rifa,
              reserva: { ...reservaFull, numeros },
              tenantSlug: reservaFull.rifa.tenant.slug
            }),
            texto: `Olá ${reservaFull.usuario.nome}, sua reserva #${reservaFull.id} na rifa "${reservaFull.rifa.titulo}" expirou por falta de pagamento. Acesse ${process.env.APP_URL}/${reservaFull.rifa.tenant.slug} para participar novamente.`
          });
        }
      } catch (e) {
        console.error('[Email] Falha ao enviar email de expiração:', e.message);
      }
    });

    return resultado;
  },

  async buscarPorId(id, tenantId = null) {
    await this.expirarSeNecessario(Number(id));
    const reserva = await prisma.reserva.findUnique({
      where: { id: Number(id) },
      include: {
        usuario: true,
        rifa: { include: { tenant: true } },
        reservaNumeros: { include: { numero: true } }
      }
    });

    if (!reserva) return null;
    if (tenantId && reserva.rifa.tenantId !== Number(tenantId)) return null;

    return {
      ...reserva,
      numeros: reserva.reservaNumeros.map((rn) => rn.numero.numero)
    };
  },

  async listarPorRifa(rifaId) {
    const reservas = await prisma.reserva.findMany({
      where: { rifaId: Number(rifaId) },
      include: {
        usuario: true,
        reservaNumeros: { include: { numero: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reservas.map((r) => ({
      ...r,
      numeros: r.reservaNumeros.map((rn) => rn.numero.numero)
    }));
  },

  /** Monta pagamento PIX via plataforma (Woovi) */
  async montarPagamento(reserva, rifa, tenant, usuario) {
    if (!PaymentService.isConfigured(tenant)) {
      throw new Error('Pagamentos indisponíveis. O organizador deve configurar a chave PIX na Carteira.');
    }

    const correlationID = reserva.codigoPagamento || `reserva-${reserva.id}`;
    const {
      TAXA_PLATAFORMA,
      ORGANIZADOR_PERCENTUAL_WOOVI,
      TAXA_FIXA_COTA_WOOVI
    } = require('../lib/config');

    const valorCobrado = reserva.valorTotal;
    const cotasReserva = (reserva.numeros || reserva.reservaNumeros || []).length;
    const valorOrganizador = Math.max(
      0,
      reserva.valorTotal * ORGANIZADOR_PERCENTUAL_WOOVI - cotasReserva * TAXA_FIXA_COTA_WOOVI
    );

    const charge = await PaymentService.criarCobranca(tenant, {
      correlationID,
      valorReais: valorCobrado,
      valorOrganizadorReais: valorOrganizador,
      comentario: `Rifa: ${rifa.titulo}`.slice(0, 120),
      expiraEm: obterExpiraEmReserva(reserva),
      cliente: {
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        cpf: usuario.cpf
      }
    });

    const paymentRef = charge.paymentId || charge.correlationID;

    await prisma.reserva.update({
      where: { id: reserva.id },
      data: {
        wooviCorrelationId: String(paymentRef),
        wooviBrCode: charge.brCode || null
      }
    });

    const qrUrl = charge.qrCodeImage
      || (charge.brCode ? `https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${encodeURIComponent(charge.brCode)}` : '');

    return {
      metodo: 'pix',
      valor: valorCobrado,
      valorOrganizador,
      taxaPlataforma: reserva.valorTotal * TAXA_PLATAFORMA,
      codigoPagamento: reserva.codigoPagamento,
      chavePix: tenant.pixChave,
      copiaCola: charge.brCode,
      payloadPix: charge.brCode,
      qrCodeUrl: qrUrl,
      instrucoes: 'Pague via PIX. A confirmação é automática após o pagamento.'
    };
  },

  /** @deprecated PIX manual — mantido só para referência */
  montarPagamentoPix(reserva, rifa) {
    const payload = gerarPayloadPix(
      rifa.chavePix,
      reserva.valorTotal,
      rifa.titulo,
      'SAO PAULO',
      reserva.codigoPagamento
    );

    return {
      metodo: 'manual',
      valor: reserva.valorTotal,
      codigoPagamento: reserva.codigoPagamento,
      chavePix: rifa.chavePix,
      copiaCola: payload,
      payloadPix: payload,
      qrCodeUrl: `https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${encodeURIComponent(payload)}`,
      instrucoes: 'Escaneie o QR Code ou copie o código — confirmação automática em instantes.'
    };
  },

  /** Envia e-mail com dados de pagamento PIX (reserva criada) */
  async enviarEmailPagamento(reservaId) {
    setImmediate(async () => {
      try {
        const reserva = await this.buscarPorId(reservaId);
        if (!reserva || !reserva.usuario?.email) return;

        let copiaCola = reserva.wooviBrCode || null;
        let qrCodeUrl = null;

        if (!copiaCola) {
          try {
            const pag = await this.montarPagamento(reserva, reserva.rifa, reserva.rifa.tenant, reserva.usuario);
            copiaCola = pag.copiaCola || null;
            qrCodeUrl = pag.qrCodeUrl || null;
          } catch (_) {}
        } else {
          qrCodeUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(copiaCola)}`;
        }

        const numeros = reserva.numeros || [];
        const tenantSlug = reserva.rifa.tenant.slug;

        await enviarEmail({
          para: reserva.usuario.email,
          assunto: `Pague sua reserva na rifa "${reserva.rifa.titulo}" 🎟️`,
          html: templateReservaCriada({
            usuario: reserva.usuario,
            rifa: reserva.rifa,
            reserva: { ...reserva, numeros },
            copiaCola,
            qrCodeUrl,
            expiraEm: reserva.expiraEm,
            tenantSlug
          }),
          texto: `Olá ${reserva.usuario.nome}!\n\nReserva #${reserva.id} criada.\nRifa: ${reserva.rifa.titulo}\nValor: R$ ${reserva.valorTotal.toFixed(2)}\n\nPIX Copia e Cola:\n${copiaCola || 'Disponível no comprovante'}\n\nAcesse: ${process.env.APP_URL}/${tenantSlug}/comprovante/${reserva.id}`
        });

        await notificarOrganizadores(reserva.rifa.tenantId, {
          assunto: `Nova compra — ${reserva.rifa.titulo} (aguardando PIX)`,
          html: templateNovaCompraOrganizador({
            rifa: reserva.rifa,
            reserva,
            usuario: reserva.usuario,
            numeros,
            tenantSlug,
            expiraEm: reserva.expiraEm
          }),
          texto: `Nova compra na rifa "${reserva.rifa.titulo}" — Comprador: ${reserva.usuario.nome} — ${numeros.length} cota(s) — R$ ${reserva.valorTotal.toFixed(2).replace('.', ',')} — Aguardando pagamento PIX`
        });
      } catch (e) {
        console.error('[Email] Falha ao enviar email de pagamento:', e.message);
      }
    });
  },

  /** Confirma pagamento manual (admin) — também cobre reserva expirada com PIX já pago. */
  async confirmarPagamento(reservaId, adminUsuario, tenantId = null, rifaId = null) {
    const reserva = await this.buscarPorId(reservaId, tenantId);
    if (!reserva) throw new Error('Reserva não encontrada.');
    if (rifaId && reserva.rifaId !== Number(rifaId)) throw new Error('Reserva não pertence a esta rifa.');
    if (reserva.statusPagamento === 'confirmado') return;
    if (!['pendente', 'expirado'].includes(reserva.statusPagamento)) {
      throw new Error(`Não é possível confirmar reserva com status "${reserva.statusPagamento}".`);
    }

    await this._confirmarInterno(reservaId, { permitirExpirada: true });
    await this._posConfirmacao(reserva);
    await LogService.registrar(adminUsuario, 'confirmar_pagamento', `Reserva #${reservaId}`, tenantId);
  },

  /** Confirma pagamento via webhook Woovi (também dá baixa se o PIX chegou após expirar). */
  async confirmarViaGateway(referencia) {
    if (!referencia) throw new Error('Referência de pagamento ausente.');

    const ref = String(referencia);
    const reserva = await prisma.reserva.findFirst({
      where: {
        OR: [
          { wooviCorrelationId: ref },
          { codigoPagamento: ref }
        ]
      }
    });
    if (!reserva) throw new Error('Reserva não encontrada para esta cobrança.');

    if (reserva.statusPagamento === 'confirmado') return reserva;
    if (!['pendente', 'expirado'].includes(reserva.statusPagamento)) {
      throw new Error(`Reserva não pode ser confirmada (status: ${reserva.statusPagamento}).`);
    }

    // Confirma só se a API Woovi disser COMPLETED e o valor bater com a reserva.
    // PIX tardio (após expiraEm) também dá baixa — melhor que estornar.
    const WooviService = require('./wooviService');
    const PaymentService = require('./paymentService');
    const charge = await WooviService.consultarCobranca(reserva.wooviCorrelationId || ref);
    if (!PaymentService.pagamentoConfirmado(charge?.status)) {
      // Sem pagamento no gateway: aí sim pode marcar expirada se o prazo passou
      if (reserva.statusPagamento === 'pendente') {
        await this.expirarSeNecessario(reserva.id);
      }
      throw new Error(`Pagamento ainda não confirmado no gateway (${charge?.status || 'desconhecido'}).`);
    }
    const esperadoCents = Math.round(Number(reserva.valorTotal) * 100);
    const pagoCents = Number(charge?.valueCents);
    if (!Number.isFinite(pagoCents) || Math.abs(esperadoCents - pagoCents) > 1) {
      console.warn(
        `[Gateway] valor diverge reserva=#${reserva.id} esperado=${esperadoCents}c pago=${pagoCents}c`
      );
      throw new Error('Valor do pagamento não confere com a reserva.');
    }

    const eraExpirada = reserva.statusPagamento === 'expirado';
    await this._confirmarInterno(reserva.id, { permitirExpirada: true });
    await this._posConfirmacao(reserva);
    const origem = PaymentService.getProvider() || 'gateway';
    const extra = eraExpirada ? ' (PIX após expiração — baixa automática)' : '';
    await LogService.registrar(origem, 'confirmar_pagamento_auto', `Reserva #${reserva.id} — ${ref}${extra}`);
    if (eraExpirada) {
      console.log(`[Gateway] Reserva #${reserva.id} confirmada após expiração (PIX tardio).`);
    }

    return prisma.reserva.findUnique({ where: { id: reserva.id } });
  },

  /** @deprecated alias Woovi */
  async confirmarViaWoovi(referencia) {
    return this.confirmarViaGateway(referencia);
  },

  /** Confirma via webhook simulado (modo manual) */
  async confirmarViaWebhook(codigoPagamento) {
    const reserva = await prisma.reserva.findUnique({ where: { codigoPagamento } });
    if (!reserva) throw new Error('Reserva não encontrada.');
    if (reserva.statusPagamento === 'confirmado') return reserva;
    if (!['pendente', 'expirado'].includes(reserva.statusPagamento)) {
      throw new Error('Reserva não está pendente.');
    }

    await this._confirmarInterno(reserva.id, { permitirExpirada: true });
    await this._posConfirmacao(reserva);
    await LogService.registrar('webhook', 'confirmar_pagamento_auto', `Reserva #${reserva.id} — ${codigoPagamento}`);

    return prisma.reserva.findUnique({ where: { id: reserva.id } });
  },

  async _posConfirmacao(reserva) {
    if (reserva.codigoIndicacaoUsado) {
      await IndicacaoService.processarBonus(reserva.codigoIndicacaoUsado);
    }
  },

  /** Consulta status da reserva (polling frontend) */
  async consultarStatus(reservaId, tenantId = null) {
    await this.expirarSeNecessario(Number(reservaId));
    const reserva = await this.buscarPorId(reservaId, tenantId);
    if (!reserva) throw new Error('Reserva não encontrada.');

    return {
      status: reserva.statusPagamento,
      reserva,
      expiraEm: obterExpiraEmReserva(reserva)
    };
  },

  /**
   * Confirma reserva e marca números como vendidos.
   * Se a reserva já expirava e algum número foi pego por outra pessoa,
   * realoca números livres equivalentes (PIX tardio).
   */
  async _confirmarInterno(reservaId, { permitirExpirada = false } = {}) {
    let confirmada = null;
    await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findUnique({ where: { id: Number(reservaId) } });
      if (!reserva) throw new Error('Reserva não encontrada.');
      if (reserva.statusPagamento === 'confirmado') {
        confirmada = reserva;
        return;
      }
      const statusOk =
        reserva.statusPagamento === 'pendente' ||
        (permitirExpirada && reserva.statusPagamento === 'expirado');
      if (!statusOk) {
        throw new Error('Reserva não encontrada ou não pendente.');
      }

      const vinculos = await tx.reservaNumero.findMany({
        where: { reservaId: reserva.id },
        include: { numero: true }
      });

      for (const v of vinculos) {
        const claimed = await tx.numero.updateMany({
          where: {
            id: v.numeroId,
            status: { in: ['disponivel', 'reservado'] }
          },
          data: {
            status: 'vendido',
            usuarioId: reserva.usuarioId,
            reservadoAte: null
          }
        });

        if (claimed.count > 0) continue;

        // Número já vendido (ou indisponível) — realoca outro livre na mesma rifa
        const alt = await tx.numero.findFirst({
          where: { rifaId: reserva.rifaId, status: 'disponivel' },
          orderBy: { numero: 'asc' }
        });
        if (!alt) {
          throw new Error(
            `Pagamento ok, mas sem números livres para realocar a reserva #${reserva.id}. Contate o suporte.`
          );
        }
        const altClaim = await tx.numero.updateMany({
          where: { id: alt.id, status: 'disponivel' },
          data: {
            status: 'vendido',
            usuarioId: reserva.usuarioId,
            reservadoAte: null
          }
        });
        if (altClaim.count === 0) {
          throw new Error(
            `Falha ao realocar número na reserva #${reserva.id}. Tente sincronizar de novo.`
          );
        }
        await tx.reservaNumero.delete({ where: { id: v.id } });
        await tx.reservaNumero.create({
          data: { reservaId: reserva.id, numeroId: alt.id }
        });
        console.log(
          `[Gateway] Reserva #${reserva.id}: número ${v.numero?.numero} indisponível → realocado para ${alt.numero}`
        );
      }

      confirmada = await tx.reserva.update({
        where: { id: reserva.id },
        data: { statusPagamento: 'confirmado' }
      });
    });

    if (confirmada) {
      setImmediate(async () => {
        try {
          const AnalyticsService = require('./analyticsService');
          const rifa = await prisma.rifa.findUnique({
            where: { id: confirmada.rifaId },
            select: { tenant: { select: { slug: true } } }
          });
          await AnalyticsService.registrarEvento({
            event: AnalyticsService.EVENTOS.PURCHASE_PAID,
            rifaId: confirmada.rifaId,
            tenantSlug: rifa?.tenant?.slug || null,
            valor: confirmada.valorTotal,
            meta: { reservaId: confirmada.id }
          });
        } catch (e) {
          console.error('[Analytics] purchase_paid:', e.message);
        }
      });
    }

    // Envia emails de confirmação em background (comprador + organizadores)
    setImmediate(async () => {
      try {
        const reservaFull = await prisma.reserva.findUnique({
          where: { id: Number(reservaId) },
          include: {
            usuario: true,
            rifa: {
              include: {
                tenant: {
                  include: { organizadores: { select: { email: true, nome: true } } }
                }
              }
            },
            reservaNumeros: { include: { numero: true } }
          }
        });

        if (!reservaFull?.rifa) return;

        const numeros = reservaFull.reservaNumeros.map(rn => rn.numero.numero);
        const tenant = reservaFull.rifa.tenant;
        const tenantSlug = tenant.slug;

        // Email para o comprador
        if (reservaFull.usuario?.email) {
          await enviarEmail({
            para: reservaFull.usuario.email,
            assunto: `Pagamento confirmado — Rifa "${reservaFull.rifa.titulo}" ✓`,
            html: templatePagamentoConfirmado({
              usuario: reservaFull.usuario,
              rifa: reservaFull.rifa,
              reserva: { ...reservaFull, numeros },
              tenantSlug
            }),
            texto: `Olá ${reservaFull.usuario.nome}! Seu pagamento da reserva #${reservaFull.id} foi confirmado. Números: ${numeros.join(', ')}. Boa sorte!`
          });
        }

        // Email para cada organizador do tenant
        const { ORGANIZADOR_PERCENTUAL, ORGANIZADOR_PERCENTUAL_WOOVI, TAXA_FIXA_COTA_WOOVI } = require('../lib/config');
        const provider = PaymentService.getProvider(tenant);
        const orgPct = provider === 'woovi' ? ORGANIZADOR_PERCENTUAL_WOOVI : ORGANIZADOR_PERCENTUAL;
        const valorOrganizador = provider === 'woovi'
          ? Math.max(0, reservaFull.valorTotal * orgPct - numeros.length * TAXA_FIXA_COTA_WOOVI)
          : reservaFull.valorTotal * orgPct;
        const taxaDescricao = provider === 'woovi'
          ? `após comissão 5% + R$ ${TAXA_FIXA_COTA_WOOVI.toFixed(2).replace('.', ',')}/cota`
          : `após comissão ${Math.round((1 - orgPct) * 100)}%`;

        for (const org of (tenant.organizadores || [])) {
          if (!org.email) continue;
          await enviarEmail({
            para: org.email,
            assunto: `Nova venda confirmada — ${reservaFull.rifa.titulo} (+R$ ${valorOrganizador.toFixed(2).replace('.', ',')})`,
            html: templateVendaOrganizador({
              rifa: reservaFull.rifa,
              reserva: reservaFull,
              usuario: reservaFull.usuario,
              numeros,
              tenantSlug,
              valorOrganizador,
              taxaDescricao
            }),
            texto: `Nova venda! Rifa "${reservaFull.rifa.titulo}" — Comprador: ${reservaFull.usuario?.nome || 'Anônimo'} — ${numeros.length} cota(s) — Valor: R$ ${reservaFull.valorTotal.toFixed(2).replace('.', ',')} — Sua parte: R$ ${valorOrganizador.toFixed(2).replace('.', ',')}`
          });
        }
      } catch (e) {
        console.error('[Email] Falha ao enviar email de confirmação:', e.message);
      }
    });
  },

  async cancelar(reservaId, adminUsuario, tenantId = null, rifaId = null) {
    const reserva = await this.buscarPorId(reservaId, tenantId);
    if (!reserva) throw new Error('Reserva não encontrada.');
    if (rifaId && reserva.rifaId !== Number(rifaId)) throw new Error('Reserva não pertence a esta rifa.');

    await prisma.$transaction(async (tx) => {
      await tx.reserva.update({
        where: { id: Number(reservaId) },
        data: { statusPagamento: 'cancelado' }
      });

      const vinculos = await tx.reservaNumero.findMany({ where: { reservaId: Number(reservaId) } });
      for (const v of vinculos) {
        await tx.numero.update({
          where: { id: v.numeroId },
          data: { status: 'disponivel', usuarioId: null, reservadoAte: null }
        });
      }
    });

    await LogService.registrar(adminUsuario, 'cancelar_reserva', `Reserva #${reservaId}`, tenantId);
  },

  async buscarPorCpf(cpf, tenantId) {
    const { limparCpf, cpfValido } = require('../lib/helpers');
    const cpfLimpo = limparCpf(cpf);
    if (!cpfValido(cpfLimpo)) throw new Error('CPF inválido.');

    const usuario = await prisma.usuario.findUnique({ where: { cpf: cpfLimpo } });
    if (!usuario) return { usuario: null, reservas: [] };

    await this.limparExpiradas(tenantId);

    const reservas = await prisma.reserva.findMany({
      where: {
        usuarioId: usuario.id,
        rifa: { tenantId: Number(tenantId) }
      },
      include: {
        rifa: true,
        reservaNumeros: { include: { numero: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const reservasFormatadas = reservas.map((r) => {
      const numeros = r.reservaNumeros.map((rn) => rn.numero.numero);
      return {
        ...r,
        numeros,
        rifa_titulo: r.rifa.titulo,
        rifa_status: r.rifa.status,
        numero_sorteado: r.rifa.numeroSorteado,
        ganhador_nome: r.rifa.ganhadorNome,
        rifa_chave_pix: r.rifa.chavePix,
        data_sorteio: r.rifa.dataSorteio,
        valor_cota: r.rifa.valorCota,
        ganhou: r.rifa.status === 'finalizada' &&
          numeros.includes(r.rifa.numeroSorteado) &&
          r.statusPagamento === 'confirmado'
      };
    });

    return { usuario, reservas: reservasFormatadas };
  }
};

module.exports = ReservaService;
