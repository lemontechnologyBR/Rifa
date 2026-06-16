/**
 * Serviço de números — reserva temporária, compra e liberação.
 */

const prisma = require('../lib/prisma');
const CarrinhoService = require('./carrinhoService');
const { TEMPO_RESERVA_MS, calcularExpiraEm } = require('../lib/reservaConfig');

const NumeroService = {
  async _limparPedidosExpirados() {
    const ReservaService = require('./reservaService');
    await ReservaService.limparExpiradas();
  },
  async listarPorRifa(rifaId) {
    await this._limparPedidosExpirados();
    await this.limparReservasExpiradas(rifaId);
    return prisma.numero.findMany({
      where: { rifaId: Number(rifaId) },
      orderBy: { numero: 'asc' }
    });
  },

  /** Remove reservas temporárias expiradas */
  async limparReservasExpiradas(rifaId) {
    const agora = new Date();
    await prisma.numero.updateMany({
      where: {
        rifaId: Number(rifaId),
        status: 'reservado',
        reservadoAte: { lt: agora },
        reservaNumeros: { none: {} }
      },
      data: { status: 'disponivel', reservadoAte: null, usuarioId: null }
    });
  },

  /** Reserva temporária + persiste carrinho na sessão */
  async reservarTemporario(rifaId, numeros, sessionId, usuarioId = null) {
    await this._limparPedidosExpirados();
    await this.limparReservasExpiradas(rifaId);
    const expiraEm = calcularExpiraEm();

    await prisma.$transaction(async (tx) => {
      for (const num of numeros) {
        const registro = await tx.numero.findUnique({
          where: { rifaId_numero: { rifaId: Number(rifaId), numero: num } }
        });

        if (!registro) throw new Error(`Número ${num} não existe.`);

        if (registro.status !== 'disponivel') {
          if (registro.status === 'reservado' && registro.reservadoAte) {
            await tx.numero.update({
              where: { id: registro.id },
              data: { reservadoAte: expiraEm }
            });
            continue;
          }
          throw new Error(`Número ${num} não está disponível.`);
        }

        await tx.numero.update({
          where: { id: registro.id },
          data: { status: 'reservado', reservadoAte: expiraEm }
        });
      }
    });

    await CarrinhoService.salvar(sessionId, rifaId, numeros, usuarioId, expiraEm);

    return { numeros, expiraEm };
  },

  async liberarTemporario(rifaId, numeros) {
    for (const num of numeros) {
      const registro = await prisma.numero.findFirst({
        where: {
          rifaId: Number(rifaId),
          numero: num,
          status: 'reservado',
          reservaNumeros: { none: {} }
        }
      });

      if (registro && registro.reservadoAte) {
        await prisma.numero.update({
          where: { id: registro.id },
          data: { status: 'disponivel', reservadoAte: null }
        });
      }
    }
  },

  /** Escolhe números aleatórios disponíveis */
  async escolherAleatorios(rifaId, quantidade) {
    await this._limparPedidosExpirados();
    await this.limparReservasExpiradas(rifaId);
    const disponiveis = await prisma.numero.findMany({
      where: { rifaId: Number(rifaId), status: 'disponivel' },
      select: { numero: true }
    });

    if (disponiveis.length < quantidade) {
      throw new Error(`Apenas ${disponiveis.length} números disponíveis.`);
    }

    const embaralhados = disponiveis.sort(() => Math.random() - 0.5);
    return embaralhados.slice(0, quantidade).map((n) => n.numero);
  },

  /** Confirma compra — cria reserva pendente */
  async confirmarCompra(rifaId, numeros, usuarioId, valorTotal, codigoIndicacaoUsado = null) {
    await this._limparPedidosExpirados();
    await this.limparReservasExpiradas(rifaId);
    const { gerarCodigoPagamento } = require('../lib/helpers');
    const codigoPagamento = gerarCodigoPagamento();

    const reservaId = await prisma.$transaction(async (tx) => {
      const numeroIds = [];

      for (const num of numeros) {
        const registro = await tx.numero.findUnique({
          where: { rifaId_numero: { rifaId: Number(rifaId), numero: num } }
        });

        if (!registro) throw new Error(`Número ${num} não existe.`);

        const podeComprar =
          registro.status === 'disponivel' ||
          (registro.status === 'reservado' && registro.reservadoAte);

        if (!podeComprar) throw new Error(`Número ${num} não está disponível.`);

        numeroIds.push(registro.id);
      }

      const reserva = await tx.reserva.create({
        data: {
          usuarioId,
          rifaId: Number(rifaId),
          valorTotal,
          statusPagamento: 'pendente',
          codigoPagamento,
          codigoIndicacaoUsado,
          expiraEm: calcularExpiraEm()
        }
      });

      for (const numeroId of numeroIds) {
        await tx.numero.update({
          where: { id: numeroId },
          data: { status: 'reservado', reservadoAte: null, usuarioId }
        });
        await tx.reservaNumero.create({
          data: { reservaId: reserva.id, numeroId }
        });
      }

      return reserva.id;
    });

    return { reservaId, codigoPagamento };
  }
};

module.exports = NumeroService;
