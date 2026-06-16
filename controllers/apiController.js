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

      const numeros = await NumeroService.escolherAleatorios(rifa.id, quantidade);
      res.json({ sucesso: true, numeros, quantidade: numeros.length });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  },

  async comprar(req, res) {
    try {
      const { numeros, nome, telefone, cpf, chave_pix } = req.body;
      const tenant = req.tenant;

      const rifa = await RifaService.buscarPorId(req.params.id, tenant.id);
      if (!rifa || rifa.status !== 'ativa') return res.status(404).json({ erro: 'Rifa não encontrada.' });

      if (!nome || !telefone || !cpf) return res.status(400).json({ erro: 'Nome, CPF e telefone são obrigatórios.' });
      const usuario = await AuthService.buscarOuCriarConvidado({ nome, telefone, cpf, chavePix: chave_pix });

      const nums = numeros.map(Number);
      const bonusUsado = await IndicacaoService.consumirBonus(usuario.id, nums.length);
      const valorTotal = RifaService.calcularValor(rifa.faixasDesconto, rifa.valorCota, nums.length, bonusUsado);
      const codigoIndicacao = req.session.codigoIndicacao || req.body.codigo_indicacao || null;

      const { reservaId } = await NumeroService.confirmarCompra(
        rifa.id, nums, usuario.id, valorTotal, codigoIndicacao
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
    try {
      const WooviService = require('../services/wooviService');
      const correlationID = WooviService.extrairCorrelationId(req.body);
      if (!correlationID) {
        return res.status(400).json({ erro: 'Payload Woovi inválido.' });
      }
      const reserva = await ReservaService.confirmarViaWoovi(correlationID);
      res.json({ sucesso: true, reservaId: reserva.id, status: 'confirmado' });
    } catch (err) {
      if (err.message.includes('não encontrada') || err.message.includes('confirmado')) {
        return res.json({ sucesso: true, message: err.message });
      }
      res.status(400).json({ erro: err.message });
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
