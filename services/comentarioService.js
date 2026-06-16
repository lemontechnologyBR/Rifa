/**
 * Serviço de comentários/depoimentos nas rifas.
 */

const prisma = require('../lib/prisma');
const { limparCpf, cpfValido } = require('../lib/helpers');

const ComentarioService = {
  async listar(rifaId) {
    return prisma.comentario.findMany({
      where: { rifaId: Number(rifaId) },
      include: { usuario: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  },

  async criar(rifaId, usuarioId, texto) {
    return prisma.comentario.create({
      data: {
        rifaId: Number(rifaId),
        usuarioId,
        texto: texto.trim()
      },
      include: { usuario: { select: { nome: true } } }
    });
  },

  /** Apenas comprador com cota paga e confirmada — 1 depoimento por pessoa/rifa */
  async criarSeCompradorConfirmado(rifaId, cpf, texto) {
    const cpfLimpo = limparCpf(cpf);
    if (!cpfValido(cpfLimpo)) throw new Error('CPF inválido.');

    const t = String(texto || '').trim();
    if (t.length < 3) throw new Error('Depoimento deve ter pelo menos 3 caracteres.');

    const usuario = await prisma.usuario.findUnique({ where: { cpf: cpfLimpo } });
    if (!usuario) {
      throw new Error('Nenhuma compra confirmada encontrada para este CPF nesta rifa.');
    }

    const reservaConfirmada = await prisma.reserva.findFirst({
      where: {
        usuarioId: usuario.id,
        rifaId: Number(rifaId),
        statusPagamento: 'confirmado'
      }
    });
    if (!reservaConfirmada) {
      throw new Error('Só quem comprou e teve o pagamento confirmado pode deixar depoimento.');
    }

    const existente = await prisma.comentario.findFirst({
      where: { rifaId: Number(rifaId), usuarioId: usuario.id }
    });
    if (existente) throw new Error('Você já deixou um depoimento nesta rifa.');

    return this.criar(rifaId, usuario.id, t);
  }
};

module.exports = ComentarioService;
