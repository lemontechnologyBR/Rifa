/**
 * Avisa organizadores sobre novidades da plataforma.
 * Produção: node -e "require('./services/avisoNovidadesService').enviarParaTodos()"
 */
const prisma = require('../lib/prisma');
const { enviarEmail } = require('../lib/emailService');
const {
  templateNovidadesPlataforma,
  templateAtualizacaoPainelRifas
} = require('../lib/emailTemplates');

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

function montarCampanha(campanha, org, rifasAtivas) {
  const slug = org.tenant.slug;
  if (campanha === 'painel_rifas') {
    return {
      assunto: 'VouRifar: editar cotas e excluir rifa no painel',
      html: templateAtualizacaoPainelRifas({
        organizador: org,
        tenantSlug: slug,
        rifasAtivas
      }),
      texto: [
        `Olá, ${org.nome}!`,
        'Melhorias no painel das rifas:',
        '- Editar total de cotas com a rifa ativa (aumentar livre; reduzir só cotas disponíveis)',
        '- Excluir sorteio (bloqueado se houver cotas pagas)',
        '- KYC na Carteira antes do próximo saque',
        `Rifas: https://vourifar.com.br/${slug}/admin/rifas`,
        `Painel: https://vourifar.com.br/${slug}/admin`
      ].join('\n')
    };
  }

  // default / kyc
  return {
    assunto: 'VouRifar: verificação de identidade antes do saque',
    html: templateNovidadesPlataforma({
      organizador: org,
      tenantSlug: slug,
      rifasAtivas
    }),
    texto: [
      `Olá, ${org.nome}!`,
      'Atualização na Carteira VouRifar:',
      '- Verificação de identidade (KYC) antes do primeiro saque',
      '- Documento + selfie em ambiente seguro (Didit)',
      '- Rifas, vendas e saldo não mudam',
      '- Depois de aprovado, saque com PIN e PIX como antes',
      `Carteira: https://vourifar.com.br/${slug}/admin/carteira`,
      `Painel: https://vourifar.com.br/${slug}/admin`
    ].join('\n')
  };
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

  /**
   * @param {{ dryRun?: boolean, publico?: 'rifa_ativa'|'todos_ativos', campanha?: 'kyc'|'painel_rifas' }} opts
   */
  async enviarParaTodos({ dryRun = false, publico = 'rifa_ativa', campanha = 'kyc' } = {}) {
    const orgs = await this.listarDestinatarios(publico);
    let enviados = 0;
    const erros = [];
    const destinatarios = [];
    const tipo = campanha === 'painel_rifas' ? 'painel_rifas' : 'kyc';

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
        const msg = montarCampanha(tipo, org, rifasAtivas);
        await enviarEmail({
          para: org.email,
          assunto: msg.assunto,
          html: msg.html,
          texto: msg.texto
        });
        enviados++;
        console.log(`[AvisoNovidades] [${tipo}] Enviado para ${org.email} (/${org.tenant.slug}) rifas=${rifasAtivas.length}`);
        await sleep(DELAY_MS);
      } catch (err) {
        erros.push({ orgId: org.id, email: org.email, erro: err.message });
        console.error(`[AvisoNovidades] Falha ${org.email}:`, err.message);
      }
    }

    return { total: orgs.length, enviados, dryRun, publico, campanha: tipo, destinatarios, erros };
  }
};

module.exports = AvisoNovidadesService;
