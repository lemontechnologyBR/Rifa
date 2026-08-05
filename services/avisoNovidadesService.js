/**
 * Avisa organizadores com rifa ativa sobre novidades da plataforma.
 * Produção: node -e "require('./services/avisoNovidadesService').enviarParaTodos()"
 */
const prisma = require('../lib/prisma');
const { enviarEmail } = require('../lib/emailService');
const { templateNovidadesPlataforma } = require('../lib/emailTemplates');

const DELAY_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const AvisoNovidadesService = {
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
        nome: org.nome,
        slug: org.tenant.slug,
        rifas: rifasAtivas.length
      });

      if (dryRun) continue;

      try {
        const html = templateNovidadesPlataforma({
          organizador: org,
          tenantSlug: org.tenant.slug,
          rifasAtivas
        });
        const texto = [
          `Olá, ${org.nome}!`,
          'Novidades na VouRifar:',
          '- Tema claro na loja (dark no botão do menu)',
          '- Galeria de fotos na rifa',
          '- Pacotes rápidos e descontos por quantidade',
          '- Pódio 1º / 2º / 3º lugar',
          '- Carteira e saque mais estáveis',
          `Painel: https://vourifar.com.br/${org.tenant.slug}/admin`,
          `Loja: https://vourifar.com.br/${org.tenant.slug}`
        ].join('\n');

        await enviarEmail({
          para: org.email,
          assunto: 'Novidades na VouRifar: tema, galeria, pacotes e mais ✨',
          html,
          texto
        });
        enviados++;
        console.log(`[AvisoNovidades] Enviado para ${org.email} (/${org.tenant.slug}) rifas=${rifasAtivas.length}`);
        await sleep(DELAY_MS);
      } catch (err) {
        erros.push({ orgId: org.id, email: org.email, erro: err.message });
        console.error(`[AvisoNovidades] Falha ${org.email}:`, err.message);
      }
    }

    return { total: orgs.length, enviados, dryRun, destinatarios, erros };
  }
};

module.exports = AvisoNovidadesService;
