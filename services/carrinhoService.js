/**
 * Serviço de carrinho persistente por sessão (mesmo prazo da reserva).
 */

const prisma = require('../lib/prisma');

const CarrinhoService = {
  async salvar(sessionId, rifaId, numeros, usuarioId, expiraEm) {
    return prisma.carrinho.upsert({
      where: { sessionId_rifaId: { sessionId, rifaId: Number(rifaId) } },
      create: {
        sessionId,
        rifaId: Number(rifaId),
        usuarioId,
        numeros: JSON.stringify(numeros),
        expiraEm
      },
      update: {
        numeros: JSON.stringify(numeros),
        expiraEm,
        usuarioId
      }
    });
  },

  async obter(sessionId, rifaId) {
    const carrinho = await prisma.carrinho.findUnique({
      where: { sessionId_rifaId: { sessionId, rifaId: Number(rifaId) } }
    });

    if (!carrinho || new Date(carrinho.expiraEm) < new Date()) {
      if (carrinho) await this.remover(sessionId, rifaId);
      return null;
    }

    return { ...carrinho, numeros: JSON.parse(carrinho.numeros) };
  },

  async remover(sessionId, rifaId) {
    try {
      await prisma.carrinho.delete({
        where: { sessionId_rifaId: { sessionId, rifaId: Number(rifaId) } }
      });
    } catch (e) { /* carrinho já removido */ }
  },

  /** Restaura carrinho ao reabrir navegador */
  async restaurar(sessionId, rifaId, usuarioId = null) {
    const carrinho = await this.obter(sessionId, rifaId);
    if (!carrinho) return null;

    const NumeroService = require('./numeroService');
    try {
      await NumeroService.reservarTemporario(rifaId, carrinho.numeros, sessionId, usuarioId);
      return carrinho.numeros;
    } catch (e) {
      await this.remover(sessionId, rifaId);
      return null;
    }
  }
};

module.exports = CarrinhoService;
