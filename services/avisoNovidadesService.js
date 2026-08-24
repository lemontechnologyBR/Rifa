/**
 * Avisa organizadores sobre novidades da plataforma.
 * Produção: node -e "require('./services/avisoNovidadesService').enviarParaTodos()"
 */
const prisma = require('../lib/prisma');
const { enviarEmail } = require('../lib/emailService');
const { templateNovidadesPlataforma } = require('../lib/emailTemplates');

const DELAY_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const tenantInclude = {
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
};

const AvisoNovidadesService = {
  async listarComRifaAtiva() {
    return prisma.organizador.findMany({
      where: {
        tenant: {
          status: 'ativo',
          rifas: { some: { status: 'ativa' } }
        }
      },
      include: { tenant: tenantInclude },
      orderBy: { createdAt: 'asc' }
    });
  },

  async listarTenantsAtivos() {
    return prisma.organizador.findMany({
      where: {
        tenant: { status: 'ativo' }
      },
      include: { tenant: tenantInclude },
      orderBy: { createdAt: 'asc' }
    });
  },

  async listarDestinatarios(publico = 'rifa_ativa') {
    if (publico === 'todos_ativos') return this.listarTenantsAtivos();
    return this.listarComRifaAtiva();
  },

  async enviarParaTodos({ dryRun = false, publico = 'rifa_ativa' } = {}) {
    const orgs = await this.listarDestinatarios(publico);
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
          'Atualização na Carteira VouRifar:',
          '- Verificação de identidade (KYC) antes do primeiro saque',
          '- Documento + selfie em ambiente seguro (Didit)',
          '- Rifas, vendas e saldo não mudam',
          '- Depois de aprovado, saque com PIN e PIX como antes',
          `Carteira: https://vourifar.com.br/${org.tenant.slug}/admin/carteira`,
          `Painel: https://vourifar.com.br/${org.tenant.slug}/admin`
        ].join('\n');

        await enviarEmail({
          para: org.email,
          assunto: 'VouRifar: verificação de identidade antes do saque',
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

    return { total: orgs.length, enviados, dryRun, publico, destinatarios, erros };
  }
};

module.exports = AvisoNovidadesService;
