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
  templateVendaOrganizador
} = require('../lib/emailTemplates');

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

  /** Monta pagamento PIX via gateway ativo (Mercado Pago ou Woovi legado) */
  async montarPagamento(reserva, rifa, tenant, usuario) {
    if (!PaymentService.isConfigured(tenant)) {
      throw new Error('Pagamentos indisponíveis. O organizador deve conectar a Carteira (Mercado Pago ou PIX).');
    }

    const correlationID = reserva.codigoPagamento || `reserva-${reserva.id}`;
    const {
      TAXA_PLATAFORMA,
      ORGANIZADOR_PERCENTUAL,
      ORGANIZADOR_PERCENTUAL_WOOVI
    } = require('../lib/config');
    const provider = PaymentService.getProvider(tenant);

    const valorCobrado = reserva.valorTotal;
    const orgPct = provider === 'woovi' ? ORGANIZADOR_PERCENTUAL_WOOVI : ORGANIZADOR_PERCENTUAL;
    const valorOrganizador = reserva.valorTotal * orgPct;

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
      metodo: provider || 'pix',
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

        await enviarEmail({
          para: reserva.usuario.email,
          assunto: `Pague sua reserva na rifa "${reserva.rifa.titulo}" 🎟️`,
          html: templateReservaCriada({
            usuario: reserva.usuario,
            rifa: reserva.rifa,
            reserva: { ...reserva, numeros: reserva.numeros || [] },
            copiaCola,
            qrCodeUrl,
            expiraEm: reserva.expiraEm,
            tenantSlug: reserva.rifa.tenant.slug
          }),
          texto: `Olá ${reserva.usuario.nome}!\n\nReserva #${reserva.id} criada.\nRifa: ${reserva.rifa.titulo}\nValor: R$ ${reserva.valorTotal.toFixed(2)}\n\nPIX Copia e Cola:\n${copiaCola || 'Disponível no comprovante'}\n\nAcesse: ${process.env.APP_URL}/${reserva.rifa.tenant.slug}/comprovante/${reserva.id}`
        });
      } catch (e) {
        console.error('[Email] Falha ao enviar email de pagamento:', e.message);
      }
    });
  },

  /** Confirma pagamento manual (admin) */
  async confirmarPagamento(reservaId, adminUsuario, tenantId = null, rifaId = null) {
    const reserva = await this.buscarPorId(reservaId, tenantId);
    if (!reserva) throw new Error('Reserva não encontrada.');
    if (rifaId && reserva.rifaId !== Number(rifaId)) throw new Error('Reserva não pertence a esta rifa.');

    await this._confirmarInterno(reservaId);
    await LogService.registrar(adminUsuario, 'confirmar_pagamento', `Reserva #${reservaId}`, tenantId);
  },

  /** Confirma pagamento via webhook do gateway (Woovi ou Mercado Pago) */
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

    await this.expirarSeNecessario(reserva.id);
    const atualizada = await prisma.reserva.findUnique({ where: { id: reserva.id } });
    if (atualizada.statusPagamento === 'expirado') throw new Error('Reserva expirada.');
    if (atualizada.statusPagamento === 'confirmado') return atualizada;
    if (atualizada.statusPagamento !== 'pendente') throw new Error('Reserva não está pendente.');

    await this._confirmarInterno(atualizada.id);
    await this._posConfirmacao(atualizada);
    const origem = PaymentService.getProvider() || 'gateway';
    await LogService.registrar(origem, 'confirmar_pagamento_auto', `Reserva #${atualizada.id} — ${ref}`);

    return atualizada;
  },

  /** @deprecated alias Woovi */
  async confirmarViaWoovi(referencia) {
    return this.confirmarViaGateway(referencia);
  },

  /** Confirma via webhook simulado (modo manual) */
  async confirmarViaWebhook(codigoPagamento) {
    const reserva = await prisma.reserva.findUnique({ where: { codigoPagamento } });
    if (!reserva) throw new Error('Reserva não encontrada.');
    await this.expirarSeNecessario(reserva.id);
    const atualizada = await prisma.reserva.findUnique({ where: { id: reserva.id } });
    if (atualizada.statusPagamento === 'expirado') throw new Error('Reserva expirada.');
    if (atualizada.statusPagamento !== 'pendente') throw new Error('Reserva não está pendente.');

    await this._confirmarInterno(atualizada.id);
    await this._posConfirmacao(atualizada);
    await LogService.registrar('webhook', 'confirmar_pagamento_auto', `Reserva #${atualizada.id} — ${codigoPagamento}`);

    return atualizada;
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

  async _confirmarInterno(reservaId) {
    await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findUnique({ where: { id: Number(reservaId) } });
      if (!reserva || reserva.statusPagamento !== 'pendente') {
        throw new Error('Reserva não encontrada ou não pendente.');
      }

      await tx.reserva.update({
        where: { id: reserva.id },
        data: { statusPagamento: 'confirmado' }
      });

      const vinculos = await tx.reservaNumero.findMany({ where: { reservaId: reserva.id } });
      for (const v of vinculos) {
        await tx.numero.update({ where: { id: v.numeroId }, data: { status: 'vendido' } });
      }
    });

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
        const { ORGANIZADOR_PERCENTUAL, ORGANIZADOR_PERCENTUAL_WOOVI } = require('../lib/config');
        const provider = PaymentService.getProvider(tenant);
        const orgPct = provider === 'woovi' ? ORGANIZADOR_PERCENTUAL_WOOVI : ORGANIZADOR_PERCENTUAL;

        for (const org of (tenant.organizadores || [])) {
          if (!org.email) continue;
          await enviarEmail({
            para: org.email,
            assunto: `Nova venda confirmada — ${reservaFull.rifa.titulo} (+R$ ${(reservaFull.valorTotal * orgPct).toFixed(2).replace('.', ',')})`,
            html: templateVendaOrganizador({
              rifa: reservaFull.rifa,
              reserva: reservaFull,
              usuario: reservaFull.usuario,
              numeros,
              tenantSlug,
              organizadorPercentual: orgPct
            }),
            texto: `Nova venda! Rifa "${reservaFull.rifa.titulo}" — Comprador: ${reservaFull.usuario?.nome || 'Anônimo'} — ${numeros.length} cota(s) — Valor: R$ ${reservaFull.valorTotal.toFixed(2).replace('.', ',')} — Sua parte: R$ ${(reservaFull.valorTotal * orgPct).toFixed(2).replace('.', ',')}`
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
