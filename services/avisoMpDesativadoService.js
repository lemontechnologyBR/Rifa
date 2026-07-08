/**
 * Envia aviso de desativação do Mercado Pago para organizadores vinculados.
 * Uso em produção: node -e "require('./services/avisoMpDesativadoService').enviarParaTodos()"
 */
const prisma = require('../lib/prisma');
const { enviarEmail } = require('../lib/emailService');
const { templateAvisoMpDesativado } = require('../lib/emailTemplates');

const AvisoMpDesativadoService = {
  async listarVinculados() {
    return prisma.organizador.findMany({
      where: {
        tenant: {
          mpAccessToken: { not: null },
          status: 'ativo'
        }
      },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            nome: true,
            pixChave: true,
            mpNickname: true,
            mpUserId: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  },

  async enviarParaTodos() {
    const orgs = await this.listarVinculados();
    let enviados = 0;
    const erros = [];

    for (const org of orgs) {
      try {
        const temPix = !!org.tenant.pixChave;
        const html = templateAvisoMpDesativado({
          organizador: org,
          tenantSlug: org.tenant.slug,
          temPix
        });
        const texto = [
          `Olá, ${org.nome}!`,
          'O Mercado Pago avisou que contas usadas em sorteios podem ser suspensas.',
          'Por segurança, desativamos temporariamente o Mercado Pago na VouRifar.',
          'Continue vendendo com chave PIX na carteira. Taxa da plataforma: 5% (você recebe 95%).',
          temPix
            ? `Carteira: https://vourifar.com.br/${org.tenant.slug}/admin/carteira`
            : `URGENTE: cadastre sua chave PIX em https://vourifar.com.br/${org.tenant.slug}/admin/carteira`
        ].join('\n');

        await enviarEmail({
          para: org.email,
          assunto: 'Importante: Mercado Pago desativado temporariamente — taxa da plataforma em 5%',
          html,
          texto
        });
        enviados++;
        console.log(`[AvisoMP] Enviado para ${org.email} (/${org.tenant.slug}) pix=${temPix}`);
      } catch (err) {
        erros.push({ orgId: org.id, email: org.email, erro: err.message });
        console.error(`[AvisoMP] Falha ${org.email}:`, err.message);
      }
    }

    return { total: orgs.length, enviados, erros };
  }
};

module.exports = AvisoMpDesativadoService;
