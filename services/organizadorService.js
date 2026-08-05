/**
 * Conta do organizador — leitura e atualização de perfil + loja.
 */
const prisma = require('../lib/prisma');
const TenantService = require('./tenantService');
const LogService = require('./logService');

const OrganizadorService = {
  async obterConta(organizadorId, tenantId) {
    const [organizador, tenant, totalRifas] = await Promise.all([
      prisma.organizador.findFirst({
        where: { id: Number(organizadorId), tenantId: Number(tenantId) },
        select: {
          id: true,
          nome: true,
          email: true,
          googleId: true,
          createdAt: true,
          senhaHash: true,
          pinHash: true
        }
      }),
      prisma.tenant.findUnique({ where: { id: Number(tenantId) } }),
      prisma.rifa.count({ where: { tenantId: Number(tenantId) } })
    ]);

    if (!organizador || !tenant) throw new Error('Conta não encontrada.');
    const { senhaHash, pinHash, ...rest } = organizador;
    return {
      organizador: {
        ...rest,
        temSenha: !!senhaHash,
        temPin: !!pinHash
      },
      tenant,
      totalRifas
    };
  },

  async alterarSenha(organizadorId, tenantId, { senhaAtual, senhaNova, senhaConfirmar } = {}) {
    const bcrypt = require('bcrypt');
    const org = await prisma.organizador.findFirst({
      where: { id: Number(organizadorId), tenantId: Number(tenantId) }
    });
    if (!org) throw new Error('Conta não encontrada.');

    const nova = String(senhaNova || '');
    const conf = String(senhaConfirmar || '');
    if (nova.length < 6) throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
    if (nova !== conf) throw new Error('As senhas não coincidem.');

    if (org.senhaHash) {
      const ok = await bcrypt.compare(String(senhaAtual || ''), org.senhaHash);
      if (!ok) throw new Error('Senha atual incorreta.');
    }

    await prisma.organizador.update({
      where: { id: org.id },
      data: { senhaHash: bcrypt.hashSync(nova, 10) }
    });
    return true;
  },

  async atualizarConta(organizadorId, tenantId, dados, adminUsuario) {
    const org = await prisma.organizador.findFirst({
      where: { id: Number(organizadorId), tenantId: Number(tenantId) }
    });
    if (!org) throw new Error('Conta não encontrada.');

    const nomeOrg = String(dados.nome_organizador || dados.nome || '').trim();
    if (nomeOrg.length < 2) throw new Error('Informe seu nome (mínimo 2 caracteres).');

    const nomeLoja = String(dados.nome_loja || '').trim();
    if (nomeLoja.length < 2) throw new Error('Informe o nome da loja (mínimo 2 caracteres).');

    const slugFinal = TenantService.validarSlug(String(dados.slug || '').trim());
    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    if (!tenant) throw new Error('Loja não encontrada.');

    if (slugFinal !== tenant.slug) {
      const existe = await prisma.tenant.findUnique({ where: { slug: slugFinal } });
      if (existe) throw new Error('Este endereço já está em uso. Escolha outro.');
    }

    const descricao = String(dados.descricao || '').trim() || null;
    const logoUrl = String(dados.logo_url || dados.logoUrl || '').trim() || null;
    const whatsapp = dados.whatsapp !== undefined
      ? (String(dados.whatsapp || '').replace(/\D/g, '') || null)
      : tenant.whatsapp;
    const instagram = dados.instagram !== undefined
      ? (String(dados.instagram || '').trim().replace(/^@/, '') || null)
      : tenant.instagram;

    const [organizador, tenantAtualizado] = await prisma.$transaction([
      prisma.organizador.update({
        where: { id: org.id },
        data: { nome: nomeOrg }
      }),
      prisma.tenant.update({
        where: { id: Number(tenantId) },
        data: {
          nome: nomeLoja,
          slug: slugFinal,
          descricao,
          logoUrl,
          whatsapp,
          instagram
        }
      })
    ]);

    await LogService.registrar(
      adminUsuario || nomeOrg,
      'atualizar_conta',
      `Perfil e loja atualizados${slugFinal !== tenant.slug ? ` · slug: ${tenant.slug} → ${slugFinal}` : ''}`,
      tenantId
    );

    return { organizador, tenant: tenantAtualizado };
  }
};

module.exports = OrganizadorService;
