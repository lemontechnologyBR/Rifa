/**
 * Controller da API tenant-scoped.
 */
const RifaService = require('../services/rifaService');
const NumeroService = require('../services/numeroService');
const ReservaService = require('../services/reservaService');
const AuthService = require('../services/authService');
const IndicacaoService = require('../services/indicacaoService');
const CarrinhoService = require('../services/carrinhoService');

const apiController = {
  async reservar(req, res) {
    try {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      if (!rifa || rifa.status !== 'ativa') return res.status(404).json({ erro: 'Rifa não encontrada.' });

      const resultado = await NumeroService.reservarTemporario(
        rifa.id, req.body.numeros.map(Number), req.sessionID, null
      );
      res.json({ sucesso: true, numeros: resultado.numeros, expiraEm: resultado.expiraEm });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async liberar(req, res) {
    try {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });

      const { numeros } = req.body;
      if (numeros?.length) await NumeroService.liberarTemporario(rifa.id, numeros.map(Number));
      await CarrinhoService.remover(req.sessionID, rifa.id);
      res.json({ sucesso: true });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async renovar(req, res) {
    try {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });

      const resultado = await NumeroService.reservarTemporario(
        rifa.id, req.body.numeros.map(Number), req.sessionID, null
      );
      res.json({ sucesso: true, expiraEm: resultado.expiraEm });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async numerosAleatorios(req, res) {
    try {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });

      const quantidade = parseInt(req.body.quantidade, 10) || 1;
      if (quantidade < 1) return res.status(400).json({ erro: 'Quantidade inválida.' });
      if (quantidade > 5000) return res.status(400).json({ erro: 'Máximo de 5.000 cotas por compra.' });

      const stats = await RifaService.obterEstatisticas(rifa.id);
      if (quantidade > stats.disponiveis) {
        return res.status(400).json({ erro: `Apenas ${stats.disponiveis} cotas disponíveis.` });
      }

      const resultado = await NumeroService.escolherEReservarAleatorios(
        rifa.id, quantidade, req.sessionID
      );
      res.json({
        sucesso: true,
        numeros: resultado.numeros,
        quantidade: resultado.numeros.length,
        expiraEm: resultado.expiraEm,
        reservado: true
      });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async comprar(req, res) {
    try {
      const { numeros, nome, telefone, cpf, email, chave_pix } = req.body;
      const tenant = req.tenant;

      const rifa = await RifaService.buscarPorId(req.params.id, tenant.id);
      if (!rifa || rifa.status !== 'ativa') return res.status(404).json({ erro: 'Rifa não encontrada.' });

      if (!nome || !telefone || !cpf || !email) {
        return res.status(400).json({ erro: 'Nome, e-mail, CPF e telefone são obrigatórios.' });
      }
      const usuario = await AuthService.buscarOuCriarConvidado({
        nome, telefone, cpf, email, chavePix: chave_pix
      });

      const nums = numeros.map(Number);
      const bonusUsado = await IndicacaoService.consumirBonus(usuario.id, nums.length);
      const valorTotal = RifaService.calcularValor(rifa.faixasDesconto, rifa.valorCota, nums.length, bonusUsado);
      if (valorTotal < 5.00) return res.status(400).json({ erro: `Compra mínima de R$ 5,00. Selecione pelo menos ${Math.ceil(5.00 / rifa.valorCota)} número(s).` });
      const codigoIndicacao = req.session.codigoIndicacao || req.body.codigo_indicacao || null;

      const { reservaId } = await NumeroService.confirmarCompra(
        rifa.id, nums, usuario.id, valorTotal, codigoIndicacao, req.sessionID
      );

      await CarrinhoService.remover(req.sessionID, rifa.id);

      const reserva = await ReservaService.buscarPorId(reservaId, tenant.id);
      const pagamento = await ReservaService.montarPagamento(reserva, rifa, tenant, usuario);
      await ReservaService.enviarEmailPagamento(reservaId);

      res.json({
        sucesso: true,
        reservaId,
        valorTotal,
        bonusUsado,
        codigoPagamento: reserva.codigoPagamento,
        ...pagamento,
        rifaTitulo: rifa.titulo,
        numeros: nums,
        pollingUrl: `/${tenant.slug}/api/reservas/${reservaId}/status`,
        expiraEm: reserva.expiraEm || null
      });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async statusNumeros(req, res) {
    try {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });
      const numeros = await NumeroService.listarPorRifa(rifa.id);
      res.json({ numeros });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async statusReserva(req, res) {
    try {
      const resultado = await ReservaService.consultarStatus(req.params.id, req.tenant.id);
      res.json({
        status: resultado.status,
        reservaId: resultado.reserva.id,
        expiraEm: resultado.expiraEm
      });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async webhookPagamento(req, res) {
    try {
      const secret = req.headers['x-webhook-secret'] || req.body.secret;
      if (secret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ erro: 'Secret inválido.' });
      }
      const reserva = await ReservaService.confirmarViaWebhook(req.body.codigo_pagamento);
      res.json({ sucesso: true, reservaId: reserva.id, status: 'confirmado' });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async webhookWoovi(req, res) {
    if (process.env.WOOVI_ENABLED !== 'true') {
      return res.status(410).json({ ok: false, erro: 'Woovi desativada.' });
    }
    res.json({ ok: true });
    try {
      const WooviService = require('../services/wooviService');
      const event = req.body?.event || req.body?.type || '';
      const correlationID = WooviService.extrairCorrelationId(req.body);
      console.log(`[Webhook Woovi] evento="${event}" correlationID="${correlationID}" body=${JSON.stringify(req.body).slice(0, 300)}`);

      const eventosConfirmacao = ['OPENPIX:CHARGE_COMPLETED', 'OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER', 'charge.completed'];
      if (event && !eventosConfirmacao.some(e => event.toUpperCase().includes(e.split(':').pop()))) {
        console.log(`[Webhook Woovi] evento ignorado: ${event}`);
        return;
      }

      if (!correlationID) {
        console.warn('[Webhook Woovi] Payload sem correlationID:', JSON.stringify(req.body).slice(0, 200));
        return;
      }
      const reserva = await ReservaService.confirmarViaGateway(correlationID);
      console.log(`[Webhook Woovi] Reserva #${reserva.id} confirmada via correlationID=${correlationID}`);
    } catch (err) {
      if (!err.message.includes('não encontrada') && !err.message.includes('confirmado')) {
        console.error('[Webhook Woovi] Erro ao confirmar:', err.message);
      }
    }
  },

  async webhookMercadoPago(req, res) {
    res.status(200).send('OK');
    try {
      const MercadoPagoService = require('../services/mercadoPagoService');
      const paymentId = MercadoPagoService.extrairPaymentId(req.body, req.query);
      console.log(`[Webhook MP] paymentId="${paymentId}" query=${JSON.stringify(req.query).slice(0, 120)}`);

      if (!paymentId) return;

      const payment = await MercadoPagoService.obterPagamento(paymentId);
      if (!MercadoPagoService.pagamentoConfirmado(payment?.status)) {
        console.log(`[Webhook MP] Pagamento ${paymentId} status=${payment?.status} — ignorado`);
        return;
      }

      const ref = payment.external_reference || paymentId;
      const reserva = await ReservaService.confirmarViaGateway(ref);
      console.log(`[Webhook MP] Reserva #${reserva.id} confirmada via payment=${paymentId}`);
    } catch (err) {
      if (!err.message.includes('não encontrada') && !err.message.includes('confirmado')) {
        console.error('[Webhook MP] Erro ao confirmar:', err.message);
      }
    }
  },

  /** Verifica pagamentos pendentes no gateway e confirma automaticamente */
  async sincronizarPagamentos(req, res) {
    try {
      const PaymentService = require('../services/paymentService');
      const prisma = require('../lib/prisma');

      const pendentes = await prisma.reserva.findMany({
        where: {
          statusPagamento: 'pendente',
          wooviCorrelationId: { not: null }
        },
        take: 20,
        orderBy: { createdAt: 'desc' }
      });

      const resultados = [];
      for (const r of pendentes) {
        try {
          const status = await PaymentService.consultarStatus(r.wooviCorrelationId);
          if (PaymentService.pagamentoConfirmado(status)) {
            await ReservaService.confirmarViaGateway(r.wooviCorrelationId);
            resultados.push({ id: r.id, acao: 'confirmado' });
            console.log(`[SyncPIX] Reserva #${r.id} confirmada retroativamente`);
          } else {
            resultados.push({ id: r.id, acao: 'pendente', status });
          }
        } catch (e) {
          resultados.push({ id: r.id, acao: 'erro', msg: e.message });
        }
      }

      res.json({ total: pendentes.length, resultados });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  },

  async comentar(req, res) {
    try {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });

      const ComentarioService = require('../services/comentarioService');
      const c = await ComentarioService.criarSeCompradorConfirmado(
        rifa.id, req.body.cpf, req.body.texto
      );

      res.json({
        sucesso: true,
        comentario: {
          id: c.id,
          texto: c.texto,
          createdAt: c.createdAt,
          usuario: { nome: c.usuario.nome }
        }
      });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async carrinho(req, res) {
    try {
      const rifa = await RifaService.buscarPorId(req.params.id, req.tenant.id);
      if (!rifa) return res.status(404).json({ erro: 'Rifa não encontrada.' });
      const carrinho = await CarrinhoService.obter(req.sessionID, rifa.id);
      res.json({ carrinho });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  }
};

module.exports = apiController;
