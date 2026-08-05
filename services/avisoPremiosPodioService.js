/**
 * Avisa organizadores com rifa ativa sobre o pódio 1º/2º/3º lugar.
 * Produção: node -e "require('./services/avisoPremiosPodioService').enviarParaTodos()"
 */
const prisma = require('../lib/prisma');
const { enviarEmail } = require('../lib/emailService');
const { templateNovidadePremiosPodio } = require('../lib/emailTemplates');

const AvisoPremiosPodioService = {
  async listarComRifaAtiva() {
    return prisma.organizador.findMany({
      where: {
        tenant: {
          status: 'ativo',
          rifas: { some: { status: 'ativa' } }
        }
      },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            nome: true,
            rifas: {
              where: { status: 'ativa' },
              select: { id: true, titulo: true },
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  },

  async enviarParaTodos({ dryRun = false } = {}) {
    const orgs = await this.listarComRifaAtiva();
    let enviados = 0;
    const erros = [];
    const destinatarios = [];

    for (const org of orgs) {
      const rifasAtivas = org.tenant.rifas || [];
      destinatarios.push({
        email: org.email,
        slug: org.tenant.slug,
        rifas: rifasAtivas.length
      });

      if (dryRun) continue;

      try {
        const html = templateNovidadePremiosPodio({
          organizador: org,
          tenantSlug: org.tenant.slug,
          rifasAtivas
        });
        const texto = [
          `Olá, ${org.nome}!`,
          'Novidade na VouRifar: escolha 1, 2 ou 3 prêmios (1º/2º/3º lugar).',
          'Na criação/edição da rifa, selecione a modalidade e informe os títulos.',
          'No sorteio, um número distinto é sorteado para cada prêmio.',
          `Acesse suas rifas: https://vourifar.com.br/${org.tenant.slug}/admin/rifas`
        ].join('\n');

        await enviarEmail({
          para: org.email,
          assunto: 'Novidade: pódio 1º, 2º e 3º lugar nas suas rifas',
          html,
          texto
        });
        enviados++;
        console.log(`[AvisoPremios] Enviado para ${org.email} (/${org.tenant.slug}) rifas=${rifasAtivas.length}`);
      } catch (err) {
        erros.push({ orgId: org.id, email: org.email, erro: err.message });
        console.error(`[AvisoPremios] Falha ${org.email}:`, err.message);
      }
    }

    return { total: orgs.length, enviados, dryRun, destinatarios, erros };
  }
};

module.exports = AvisoPremiosPodioService;
