/**
 * Serviço de tenants — CRUD e signup SaaS.
 */
const prisma = require('../lib/prisma');
const { slugify, isSlugReservado } = require('../lib/reservedSlugs');

const TAXA_PLATAFORMA = 0.05;

function buildWhere({ busca, status } = {}) {
  const where = {};
  if (status && status !== 'todos') where.status = status;
  if (busca && String(busca).trim()) {
    const q = String(busca).trim();
    where.OR = [
      { nome: { contains: q } },
      { slug: { contains: q.toLowerCase() } }
    ];
  }
  return where;
}

const TenantService = {
  async buscarPorSlug(slug) {
    return prisma.tenant.findUnique({ where: { slug: slug.toLowerCase() } });
  },

  async buscarPorId(id) {
    return prisma.tenant.findUnique({
      where: { id: Number(id) },
      include: {
        _count: { select: { rifas: true, organizadores: true } },
        organizadores: { select: { id: true, nome: true, email: true, createdAt: true }, orderBy: { createdAt: 'asc' } }
      }
    });
  },

  async listar({ page = 1, limite = 15, busca = '', status = 'todos' } = {}) {
    const where = buildWhere({ busca, status });
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { rifas: true, organizadores: true } },
          organizadores: { take: 1, orderBy: { createdAt: 'asc' }, select: { nome: true, email: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limite,
        take: limite
      }),
      prisma.tenant.count({ where })
    ]);
    return { tenants, total, paginas: Math.max(1, Math.ceil(total / limite)), page };
  },

  validarSlug(slug) {
    const s = slugify(slug);
    if (s.length < 3) throw new Error('Slug deve ter pelo menos 3 caracteres.');
    if (isSlugReservado(s)) throw new Error('Este slug não está disponível.');
    return s;
  },

  async criar({ nome, slug, corPrimaria }) {
    const slugFinal = this.validarSlug(slug || nome);
    const existe = await prisma.tenant.findUnique({ where: { slug: slugFinal } });
    if (existe) throw new Error('Este slug já está em uso.');

    return prisma.tenant.create({
      data: {
        nome,
        slug: slugFinal,
        corPrimaria: corPrimaria || '#6366f1'
      }
    });
  },

  async atualizar(id, dados) {
    const data = {};
    if (dados.nome) data.nome = String(dados.nome).trim();
    if (dados.descricao !== undefined) {
      const d = String(dados.descricao || '').trim();
      data.descricao = d || null;
    }
    if (dados.logoUrl !== undefined || dados.logo_url !== undefined) {
      const url = String(dados.logo_url || dados.logoUrl || '').trim();
      data.logoUrl = url || null;
    }
    if (dados.corPrimaria || dados.cor_primaria) {
      data.corPrimaria = dados.corPrimaria || dados.cor_primaria;
    }
    if (dados.whatsapp !== undefined) {
      const w = String(dados.whatsapp || '').replace(/\D/g, '');
      data.whatsapp = w || null;
    }
    if (dados.instagram !== undefined) {
      const ig = String(dados.instagram || '').trim().replace(/^@/, '');
      data.instagram = ig || null;
    }
    return prisma.tenant.update({ where: { id: Number(id) }, data });
  },

  async alterarStatus(id, status) {
    if (!['ativo', 'suspenso'].includes(status)) throw new Error('Status inválido.');
    return prisma.tenant.update({ where: { id: Number(id) }, data: { status } });
  },

  async obterMetricasPlataforma() {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const [
      totalTenants,
      tenantsSuspensos,
      totalRifas,
      rifasAtivas,
      reservasConfirmadas,
      receita,
      novosTenantsMes,
      totalOrganizadores
    ] = await Promise.all([
      prisma.tenant.count({ where: { status: 'ativo' } }),
      prisma.tenant.count({ where: { status: 'suspenso' } }),
      prisma.rifa.count(),
      prisma.rifa.count({ where: { status: 'ativa' } }),
      prisma.reserva.count({ where: { statusPagamento: 'confirmado' } }),
      prisma.reserva.aggregate({
        where: { statusPagamento: 'confirmado' },
        _sum: { valorTotal: true }
      }),
      prisma.tenant.count({ where: { createdAt: { gte: inicioMes } } }),
      prisma.organizador.count()
    ]);

    const gmvTotal = receita._sum.valorTotal || 0;

    return {
      totalTenants,
      tenantsSuspensos,
      totalRifas,
      rifasAtivas,
      reservasConfirmadas,
      gmvTotal,
      receitaPlataforma: gmvTotal * TAXA_PLATAFORMA,
      novosTenantsMes,
      totalOrganizadores
    };
  },

  async obterTenantsRecentes(limite = 5) {
    return prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: limite,
      include: {
        _count: { select: { rifas: true } },
        organizadores: { take: 1, orderBy: { createdAt: 'asc' }, select: { email: true } }
      }
    });
  }
};

module.exports = TenantService;
