/**
 * Serviço de indicação — link único e bônus de cotas grátis.
 */

const prisma = require('../lib/prisma');

const IndicacaoService = {
  /** Gera link de indicação para um usuário */
  obterLinkIndicacao(codigoIndicacao) {
    const base = process.env.APP_URL || 'http://localhost:3000';
    return `${base}/?ref=${codigoIndicacao}`;
  },

  /** Quando indicado compra e paga, indicador ganha 1 cota bônus */
  async processarBonus(codigoIndicacaoUsado) {
    const indicador = await prisma.usuario.findUnique({
      where: { codigoIndicacao: codigoIndicacaoUsado }
    });

    if (indicador) {
      await prisma.usuario.update({
        where: { id: indicador.id },
        data: { bonusCotas: { increment: 1 } }
      });
      console.log(`🎁 Bônus: ${indicador.nome} ganhou 1 cota grátis por indicação.`);
    }
  },

  /** Consome bônus de cotas na compra */
  async consumirBonus(usuarioId, quantidade) {
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || usuario.bonusCotas <= 0) return 0;

    const usado = Math.min(usuario.bonusCotas, quantidade);
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { bonusCotas: { decrement: usado } }
    });

    return usado;
  }
};

module.exports = IndicacaoService;
