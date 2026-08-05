/**
 * PIN de 6 dígitos para saque do organizador.
 */
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { gerarTokenRecuperacao } = require('../lib/helpers');
const { enviarEmail } = require('../lib/emailService');
const { templateRecuperacaoPin } = require('../lib/emailTemplates');

function normalizarPin(pin) {
  return String(pin || '').replace(/\D/g, '');
}

function validarFormatoPin(pin) {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('O PIN deve ter exatamente 6 dígitos numéricos.');
  }
  if (/^(\d)\1{5}$/.test(pin)) {
    throw new Error('Escolha um PIN menos óbvio (não use 000000, 111111…).');
  }
}

const PinService = {
  temPin(organizador) {
    return !!(organizador && organizador.pinHash);
  },

  async buscarOrganizador(organizadorId, tenantId) {
    return prisma.organizador.findFirst({
      where: { id: Number(organizadorId), tenantId: Number(tenantId) }
    });
  },

  async definirPin(organizadorId, tenantId, { pin, confirmar, pinAtual } = {}) {
    const org = await this.buscarOrganizador(organizadorId, tenantId);
    if (!org) throw new Error('Organizador não encontrado.');

    const novo = normalizarPin(pin);
    const conf = normalizarPin(confirmar);
    validarFormatoPin(novo);
    if (novo !== conf) throw new Error('Os PINs não coincidem.');

    if (org.pinHash) {
      const atual = normalizarPin(pinAtual);
      if (!atual || !(await bcrypt.compare(atual, org.pinHash))) {
        throw new Error('PIN atual incorreto.');
      }
    }

    const pinHash = bcrypt.hashSync(novo, 10);
    await prisma.organizador.update({
      where: { id: org.id },
      data: {
        pinHash,
        pinTokenRecuperacao: null,
        pinTokenExpira: null
      }
    });
    return true;
  },

  async verificarPin(organizador, pin) {
    if (!organizador?.pinHash) return false;
    const digits = normalizarPin(pin);
    if (!/^\d{6}$/.test(digits)) return false;
    return bcrypt.compare(digits, organizador.pinHash);
  },

  async solicitarRecuperacaoPin(organizador, tenantSlug) {
    const token = gerarTokenRecuperacao();
    const expira = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await prisma.organizador.update({
      where: { id: organizador.id },
      data: { pinTokenRecuperacao: token, pinTokenExpira: expira }
    });

    const appUrl = process.env.APP_URL || 'https://vourifar.com.br';
    await enviarEmail({
      para: organizador.email,
      assunto: 'Redefinir PIN de saque — VouRifar',
      html: templateRecuperacaoPin({ organizador, token, tenantSlug }),
      texto: [
        `Olá, ${organizador.nome}!`,
        'Recebemos um pedido para redefinir o PIN de saque da sua conta.',
        `Acesse: ${appUrl}/${tenantSlug}/admin/resetar-pin?token=${token}`,
        'O link expira em 2 horas.'
      ].join('\n')
    });
  },

  async resetarPinPorToken(tenantId, token, pin, confirmar) {
    if (!token) throw new Error('Token inválido.');
    const novo = normalizarPin(pin);
    const conf = normalizarPin(confirmar);
    validarFormatoPin(novo);
    if (novo !== conf) throw new Error('Os PINs não coincidem.');

    const org = await prisma.organizador.findFirst({
      where: {
        tenantId: Number(tenantId),
        pinTokenRecuperacao: token,
        pinTokenExpira: { gt: new Date() }
      }
    });
    if (!org) throw new Error('Link inválido ou expirado. Solicite uma nova recuperação.');

    await prisma.organizador.update({
      where: { id: org.id },
      data: {
        pinHash: bcrypt.hashSync(novo, 10),
        pinTokenRecuperacao: null,
        pinTokenExpira: null
      }
    });
    return org;
  }
};

module.exports = PinService;
