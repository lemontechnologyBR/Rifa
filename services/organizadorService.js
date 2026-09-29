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

    const { assertNomePessoa, assertNomeLoja } = require('../lib/sanitizeText');
    const nomeOrg = assertNomePessoa(dados.nome_organizador || dados.nome);
    const nomeLoja = assertNomeLoja(dados.nome_loja);

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
  },

  /**
   * Exclui permanentemente a loja (tenant) e a conta do organizador.
   * Bloqueia se já houver cotas/reservas pagas ou saque em andamento.
   */
  async excluirConta(organizadorId, tenantId, { confirmacao, senha } = {}) {
    const bcrypt = require('bcrypt');
    const tid = Number(tenantId);
    const oid = Number(organizadorId);

    const org = await prisma.organizador.findFirst({
      where: { id: oid, tenantId: tid }
    });
    if (!org) throw new Error('Conta não encontrada.');

    const tenant = await prisma.tenant.findUnique({ where: { id: tid } });
    if (!tenant) throw new Error('Loja não encontrada.');

    const conf = String(confirmacao || '').trim().toLowerCase();
    if (conf !== String(tenant.slug).toLowerCase()) {
      throw new Error(`Digite o endereço da loja "${tenant.slug}" para confirmar a exclusão.`);
    }

    if (org.senhaHash) {
      const ok = await bcrypt.compare(String(senha || ''), org.senhaHash);
      if (!ok) throw new Error('Senha incorreta.');
    }

    const [vendidos, confirmadas, saquesAbertos] = await Promise.all([
      prisma.numero.count({
        where: { status: 'vendido', rifa: { tenantId: tid } }
      }),
      prisma.reserva.count({
        where: { statusPagamento: 'confirmado', rifa: { tenantId: tid } }
      }),
      prisma.saque.count({
        where: {
          tenantId: tid,
          status: { in: ['solicitado', 'processando'] }
        }
      })
    ]);

    if (vendidos > 0 || confirmadas > 0) {
      throw new Error(
        'Não é possível excluir: esta loja já teve vendas pagas. Encerre os sorteios e mantenha o histórico, ou fale com o suporte.'
      );
    }
    if (saquesAbertos > 0) {
      throw new Error('Não é possível excluir: há saque em andamento. Aguarde a conclusão.');
    }

    await LogService.registrar(
      org.nome || org.email,
      'excluir_conta',
      `Conta/loja excluída · /${tenant.slug} · ${org.email}`,
      tid
    );

    await prisma.tenant.delete({ where: { id: tid } });
    return { slug: tenant.slug, email: org.email };
  }
};

module.exports = OrganizadorService;
