/**
 * E-mails de onboarding — nurture D+1/D+3 e campanha para leads quentes.
 */
const prisma = require('../lib/prisma');
const { enviarEmail } = require('../lib/emailService');
const {
  templatePrimeiraRifaD1,
  templatePrimeiraRifaD3,
  templateCampanhaLeadsQuentes
} = require('../lib/emailTemplates');
const PaymentService = require('./paymentService');

const MS_HORA = 60 * 60 * 1000;
const LEADS_MIN_DIAS = 5;

function carteiraConfigurada(tenant) {
  return PaymentService.isConfigured(tenant);
}

async function tenantSemRifas(tenantId) {
  const total = await prisma.rifa.count({ where: { tenantId: Number(tenantId) } });
  return total === 0;
}

async function enviarNurture(org, tipo) {
  const tenant = org.tenant;
  if (!tenant || tenant.status !== 'ativo') return false;
  if (!(await tenantSemRifas(tenant.id))) return false;

  const carteiraOk = carteiraConfigurada(tenant);
  const slug = tenant.slug;
  let assunto;
  let html;
  let texto;
  let campo;

  if (tipo === 'd1') {
    assunto = 'Crie sua primeira rifa na VouRifar 🎯';
    html = templatePrimeiraRifaD1({ organizador: org, tenantSlug: slug, carteiraOk });
    texto = `Olá, ${org.nome}! Crie sua primeira rifa em https://vourifar.com.br/${slug}/admin/rifas?nova=1`;
    campo = 'nurtureD1SentAt';
  } else if (tipo === 'd3') {
    assunto = 'Seu sorteio ainda está esperando ⏰';
    html = templatePrimeiraRifaD3({ organizador: org, tenantSlug: slug, carteiraOk });
    texto = `Olá, ${org.nome}! Publique seu primeiro sorteio: https://vourifar.com.br/${slug}/admin/rifas?nova=1`;
    campo = 'nurtureD3SentAt';
  } else {
    return false;
  }

  await enviarEmail({ para: org.email, assunto, html, texto });
  await prisma.organizador.update({
    where: { id: org.id },
    data: { [campo]: new Date() }
  });
  console.log(`[Onboarding] ${tipo.toUpperCase()} enviado para ${org.email} (org #${org.id})`);
  return true;
}

const OnboardingEmailService = {
  async processarNurture() {
    const agora = Date.now();

    const candidatos = await prisma.organizador.findMany({
      where: {
        tenant: { status: 'ativo', rifas: { none: {} } },
        OR: [
          {
            nurtureD1SentAt: null,
            createdAt: { lte: new Date(agora - 24 * MS_HORA) }
          },
          {
            nurtureD3SentAt: null,
            createdAt: { lte: new Date(agora - 72 * MS_HORA) }
          }
        ]
      },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            status: true,
            pixChave: true,
            mpAccessToken: true,
            wooviAtivo: true
          }
        }
      }
    });

    let enviados = 0;
    for (const org of candidatos) {
      try {
        const idadeMs = agora - new Date(org.createdAt).getTime();
        if (!org.nurtureD1SentAt && idadeMs >= 24 * MS_HORA) {
          if (await enviarNurture(org, 'd1')) enviados++;
        }
        if (!org.nurtureD3SentAt && idadeMs >= 72 * MS_HORA) {
          if (await enviarNurture(org, 'd3')) enviados++;
        }
      } catch (err) {
        console.error(`[Onboarding] Erro org #${org.id}:`, err.message);
      }
    }

    if (enviados > 0) {
      console.log(`[Onboarding] ${enviados} e-mail(s) de nurture enviado(s).`);
    }
    return enviados;
  },

  async listarLeadsQuentes() {
    const limiteData = new Date(Date.now() - LEADS_MIN_DIAS * 24 * MS_HORA);

    const orgs = await prisma.organizador.findMany({
      where: {
        createdAt: { lte: limiteData },
        campanhaLeadsSentAt: null,
        tenant: {
          status: 'ativo',
          rifas: { none: {} },
          OR: [
            { pixChave: { not: null } },
            { mpAccessToken: { not: null } }
          ]
        }
      },
      include: {
        tenant: {
          select: { id: true, slug: true, nome: true, pixChave: true, mpAccessToken: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return orgs.filter((o) => carteiraConfigurada(o.tenant));
  },

  async enviarCampanhaLeadsQuentes() {
    const leads = await this.listarLeadsQuentes();
    let enviados = 0;
    const erros = [];

    for (const org of leads) {
      try {
        if (!(await tenantSemRifas(org.tenantId))) continue;

        const html = templateCampanhaLeadsQuentes({
          organizador: org,
          tenantSlug: org.tenant.slug
        });
        const texto = `Olá, ${org.nome}! Crie sua primeira rifa: https://vourifar.com.br/${org.tenant.slug}/admin/rifas?nova=1`;

        await enviarEmail({
          para: org.email,
          assunto: 'Sua carteira está pronta — crie seu sorteio! 🚀',
          html,
          texto
        });

        await prisma.organizador.update({
          where: { id: org.id },
          data: { campanhaLeadsSentAt: new Date() }
        });

        console.log(`[Onboarding] Campanha leads enviada para ${org.email} (org #${org.id})`);
        enviados++;
      } catch (err) {
        erros.push({ orgId: org.id, email: org.email, erro: err.message });
        console.error(`[Onboarding] Campanha leads org #${org.id}:`, err.message);
      }
    }

    return { enviados, total: leads.length, erros };
  },

  async enviarNurtureManual(organizadorId, tipo = 'd1') {
    const org = await prisma.organizador.findUnique({
      where: { id: Number(organizadorId) },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            status: true,
            pixChave: true,
            mpAccessToken: true,
            wooviAtivo: true
          }
        }
      }
    });
    if (!org) throw new Error('Organizador não encontrado.');
    if (tipo !== 'd1' && tipo !== 'd3') throw new Error('Tipo de e-mail inválido.');

    const campo = tipo === 'd1' ? 'nurtureD1SentAt' : 'nurtureD3SentAt';
    if (org[campo]) throw new Error(`E-mail ${tipo.toUpperCase()} já foi enviado.`);

    const ok = await enviarNurture(org, tipo);
    if (!ok) throw new Error('Organizador já tem rifa ou conta inativa.');
    return true;
  }
};

module.exports = OnboardingEmailService;
