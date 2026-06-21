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
    const carrinhoExistente = await CarrinhoService.obter(sessionId, rifaId);
    const meusNumeros = new Set(carrinhoExistente?.numeros || []);
    const agora = new Date();

    await prisma.$transaction(async (tx) => {
      for (const num of numeros) {
        const registro = await tx.numero.findUnique({
          where: { rifaId_numero: { rifaId: Number(rifaId), numero: num } }
        });

        if (!registro) throw new Error(`Número ${num} não existe.`);

        if (registro.status === 'disponivel') {
          const reservado = await tx.numero.updateMany({
            where: { id: registro.id, status: 'disponivel' },
            data: { status: 'reservado', reservadoAte: expiraEm }
          });
          if (reservado.count === 0) {
            throw new Error(`Número ${num} não está disponível.`);
          }
          continue;
        }

        const reservaTemporariaMinha =
          registro.status === 'reservado' &&
          registro.reservadoAte &&
          new Date(registro.reservadoAte) > agora &&
          meusNumeros.has(num);

        if (reservaTemporariaMinha) {
          await tx.numero.update({
            where: { id: registro.id },
            data: { reservadoAte: expiraEm }
          });
          continue;
        }

        throw new Error(`Número ${num} não está disponível.`);
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

  /** Escolhe números aleatórios disponíveis (somente leitura — use escolherEReservarAleatorios na API) */
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

  /**
   * Sorteia e reserva cotas atomicamente (evita race entre /aleatorio e /reservar).
   * sessionId opcional: quando informado, persiste carrinho da sessão.
   */
  async escolherEReservarAleatorios(rifaId, quantidade, sessionId, usuarioId = null) {
    await this._limparPedidosExpirados();
    await this.limparReservasExpiradas(rifaId);
    const expiraEm = calcularExpiraEm();
    const numerosEscolhidos = [];

    await prisma.$transaction(async (tx) => {
      let tentativas = 0;
      const maxTentativas = Math.max(quantidade * 5, 20);

      while (numerosEscolhidos.length < quantidade && tentativas < maxTentativas) {
        tentativas += 1;
        const faltam = quantidade - numerosEscolhidos.length;
        const disponiveis = await tx.numero.findMany({
          where: {
            rifaId: Number(rifaId),
            status: 'disponivel',
            ...(numerosEscolhidos.length ? { numero: { notIn: numerosEscolhidos } } : {})
          },
          select: { id: true, numero: true },
          take: Math.min(faltam * 8, 500)
        });

        if (!disponiveis.length) break;

        disponiveis.sort(() => Math.random() - 0.5);

        for (const candidato of disponiveis) {
          if (numerosEscolhidos.length >= quantidade) break;

          const reservado = await tx.numero.updateMany({
            where: { id: candidato.id, status: 'disponivel' },
            data: { status: 'reservado', reservadoAte: expiraEm }
          });

          if (reservado.count === 1) {
            numerosEscolhidos.push(candidato.numero);
          }
        }
      }

      if (numerosEscolhidos.length < quantidade) {
        for (const num of numerosEscolhidos) {
          await tx.numero.updateMany({
            where: {
              rifaId: Number(rifaId),
              numero: num,
              status: 'reservado',
              reservadoAte: expiraEm,
              reservaNumeros: { none: {} }
            },
            data: { status: 'disponivel', reservadoAte: null }
          });
        }
        throw new Error(`Apenas ${numerosEscolhidos.length} números disponíveis.`);
      }
    });

    if (sessionId) {
      await CarrinhoService.salvar(sessionId, rifaId, numerosEscolhidos, usuarioId, expiraEm);
    }

    return { numeros: numerosEscolhidos, expiraEm, reservado: !!sessionId };
  },

  /** Tenta reservar número para checkout (disponível ou reserva temporária da sessão). */
  async _claimNumeroTx(tx, rifaId, num, usuarioId, agora, numerosPermitidos) {
    const registro = await tx.numero.findUnique({
      where: { rifaId_numero: { rifaId: Number(rifaId), numero: num } }
    });
    if (!registro) return null;

    let ok = await tx.numero.updateMany({
      where: { id: registro.id, status: 'disponivel' },
      data: { status: 'reservado', reservadoAte: null, usuarioId }
    });

    if (ok.count === 0 && numerosPermitidos.has(num)) {
      ok = await tx.numero.updateMany({
        where: {
          id: registro.id,
          status: 'reservado',
          reservadoAte: { gt: agora },
          reservaNumeros: { none: {} }
        },
        data: { status: 'reservado', reservadoAte: null, usuarioId }
      });
    }

    return ok.count === 1 ? registro : null;
  },

  /** Sorteia e reserva um número disponível dentro da transação. */
  async _pickAndClaimRandomTx(tx, rifaId, jaEscolhidos, usuarioId) {
    const exclude = new Set(jaEscolhidos);
    for (let t = 0; t < 8; t++) {
      const pool = await tx.numero.findMany({
        where: {
          rifaId: Number(rifaId),
          status: 'disponivel',
          ...(exclude.size ? { numero: { notIn: [...exclude] } } : {})
        },
        select: { id: true, numero: true },
        take: 40
      });
      if (!pool.length) return null;
      pool.sort(() => Math.random() - 0.5);
      for (const cand of pool) {
        const ok = await tx.numero.updateMany({
          where: { id: cand.id, status: 'disponivel' },
          data: { status: 'reservado', reservadoAte: null, usuarioId }
        });
        if (ok.count === 1) return cand;
      }
    }
    return null;
  },

  /**
   * Finaliza compra no modo cotas — repõe números indisponíveis automaticamente.
   */
  async finalizarCompraCotas(rifaId, quantidade, usuarioId, valorTotal, sessionId, codigoIndicacaoUsado = null) {
    await this._limparPedidosExpirados();
    await this.limparReservasExpiradas(rifaId);
    const { gerarCodigoPagamento } = require('../lib/helpers');
    const codigoPagamento = gerarCodigoPagamento();
    const agora = new Date();

    const carrinho = sessionId ? await CarrinhoService.obter(sessionId, rifaId) : null;
    const candidatos = carrinho?.numeros?.length ? [...carrinho.numeros] : [];
    const numerosPermitidos = new Set(candidatos);

    const resultado = await prisma.$transaction(async (tx) => {
      const numeroIds = [];
      const numsConfirmados = [];

      for (const num of candidatos) {
        if (numsConfirmados.length >= quantidade) break;
        const claimed = await this._claimNumeroTx(tx, rifaId, num, usuarioId, agora, numerosPermitidos);
        if (claimed) {
          numeroIds.push(claimed.id);
          numsConfirmados.push(num);
        }
      }

      while (numsConfirmados.length < quantidade) {
        const picked = await this._pickAndClaimRandomTx(tx, rifaId, numsConfirmados, usuarioId);
        if (!picked) break;
        numeroIds.push(picked.id);
        numsConfirmados.push(picked.numero);
      }

      if (numsConfirmados.length < quantidade) {
        throw new Error(`Apenas ${numsConfirmados.length} números disponíveis.`);
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
        await tx.reservaNumero.create({
          data: { reservaId: reserva.id, numeroId }
        });
      }

      return { reservaId: reserva.id, numeros: numsConfirmados };
    });

    return { reservaId: resultado.reservaId, codigoPagamento, numeros: resultado.numeros };
  },

  /** Confirma compra — cria reserva pendente (grade / números escolhidos) */
  async confirmarCompra(rifaId, numeros, usuarioId, valorTotal, codigoIndicacaoUsado = null, sessionId = null) {
    await this._limparPedidosExpirados();
    await this.limparReservasExpiradas(rifaId);

    if (sessionId && numeros.length) {
      try {
        await this.reservarTemporario(rifaId, numeros, sessionId, usuarioId);
      } catch (err) {
        throw new Error(`Não foi possível confirmar a reserva: ${err.message}`);
      }
    }

    const { gerarCodigoPagamento } = require('../lib/helpers');
    const codigoPagamento = gerarCodigoPagamento();
    const carrinho = sessionId ? await CarrinhoService.obter(sessionId, rifaId) : null;
    const nums = carrinho?.numeros?.length ? carrinho.numeros : numeros;
    const numerosPermitidos = new Set(nums);
    const agora = new Date();

    const reservaId = await prisma.$transaction(async (tx) => {
      const numeroIds = [];

      for (const num of nums) {
        const claimed = await this._claimNumeroTx(tx, rifaId, num, usuarioId, agora, numerosPermitidos);
        if (!claimed) {
          throw new Error(`Número ${num} não está disponível.`);
        }
        numeroIds.push(claimed.id);
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
        await tx.reservaNumero.create({
          data: { reservaId: reserva.id, numeroId }
        });
      }

      return reserva.id;
    });

    return { reservaId, codigoPagamento, numeros: nums };
  }
};

module.exports = NumeroService;
