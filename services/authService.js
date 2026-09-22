/**
 * Serviço de autenticação — super-admin, organizadores e checkout.
 */
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { gerarCodigoIndicacao, limparTelefone, limparCpf, cpfValido, gerarTokenRecuperacao } = require('../lib/helpers');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOME_RE = /^[\p{L}\p{M}\s'.-]{2,80}$/u;

function assertNomeValido(nome) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!NOME_RE.test(n)) {
    throw new Error('Nome inválido. Use apenas letras e espaços (2 a 80 caracteres).');
  }
  if (/https?:\/\/|www\.|@|<script/i.test(n)) {
    throw new Error('Nome inválido.');
  }
  return n;
}

function assertEmailValido(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 160) {
    throw new Error('E-mail inválido.');
  }
  return e;
}

function tokenConfirmacaoEmail() {
  const token = gerarTokenRecuperacao();
  const expira = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return { token, expira };
}

const AuthService = {
  async loginAdmin(usuario, senha) {
    const admin = await prisma.admin.findUnique({ where: { usuario } });
    if (!admin || !bcrypt.compareSync(senha, admin.senhaHash)) return null;
    return admin;
  },

  async garantirAdminPadrao() {
    const usuario = String(process.env.SUPER_ADMIN_USER || 'admin').trim();
    const senha = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
    const senhaHash = bcrypt.hashSync(senha, 10);

    const atual = await prisma.admin.findUnique({ where: { usuario } });
    if (atual) {
      if (process.env.SUPER_ADMIN_PASSWORD) {
        await prisma.admin.update({
          where: { id: atual.id },
          data: { senhaHash }
        });
      }
    } else {
      await prisma.admin.create({ data: { usuario, senhaHash } });
      console.log(`✅ Super admin criado (${usuario})`);
    }

    if (usuario !== 'admin') {
      const legado = await prisma.admin.findUnique({ where: { usuario: 'admin' } });
      if (legado) {
        await prisma.admin.delete({ where: { id: legado.id } });
        console.log('✅ Conta super admin legada (admin) removida');
      }
    }
  },

  /**
   * Contas antigas (sem token de confirmação pendente) passam a valer como verificadas.
   * Novos cadastros com token pendente não são afetados.
   */
  async garantirEmailsVerificadosLegados() {
    try {
      const r = await prisma.organizador.updateMany({
        where: {
          emailVerifiedAt: null,
          emailConfirmToken: null
        },
        data: { emailVerifiedAt: new Date() }
      });
      if (r.count > 0) {
        console.log(`✅ ${r.count} organizador(es) legado(s) marcados com e-mail verificado`);
      }
    } catch (err) {
      console.warn('[Auth] garantirEmailsVerificadosLegados:', err.message);
    }
  },

  emailVerificado(org) {
    return !!(org && org.emailVerifiedAt);
  },

  async registrarOrganizador({ tenantId, nome, email, senha }) {
    const nomeOk = assertNomeValido(nome);
    const emailOk = assertEmailValido(email);
    const existente = await prisma.organizador.findUnique({ where: { email: emailOk } });
    if (existente) throw new Error('E-mail já cadastrado.');

    const { token, expira } = tokenConfirmacaoEmail();

    return prisma.organizador.create({
      data: {
        tenantId: Number(tenantId),
        nome: nomeOk,
        email: emailOk,
        senhaHash: bcrypt.hashSync(senha, 10),
        emailVerifiedAt: null,
        emailConfirmToken: token,
        emailConfirmExpira: expira
      },
      include: { tenant: true }
    });
  },

  async registrarOrganizadorGoogle({ tenantId, nome, email, googleId }) {
    const nomeOk = assertNomeValido(nome || 'Organizador');
    const emailOk = assertEmailValido(email);
    const existente = await prisma.organizador.findUnique({ where: { email: emailOk } });
    if (existente) throw new Error('E-mail já cadastrado.');

    const googleEmUso = await prisma.organizador.findUnique({ where: { googleId } });
    if (googleEmUso) throw new Error('Conta Google já vinculada a outro sistema.');

    return prisma.organizador.create({
      data: {
        tenantId: Number(tenantId),
        nome: nomeOk,
        email: emailOk,
        googleId,
        emailVerifiedAt: new Date(),
        emailConfirmToken: null,
        emailConfirmExpira: null
      },
      include: { tenant: true }
    });
  },

  async confirmarEmailPorToken(token) {
    const t = String(token || '').trim();
    if (!t || t.length < 32) throw new Error('Link de confirmação inválido.');

    const org = await prisma.organizador.findUnique({
      where: { emailConfirmToken: t },
      include: { tenant: true }
    });
    if (!org) throw new Error('Link de confirmação inválido ou já utilizado.');
    if (org.emailConfirmExpira && org.emailConfirmExpira < new Date()) {
      throw new Error('Link de confirmação expirado. Solicite um novo e-mail.');
    }

    return prisma.organizador.update({
      where: { id: org.id },
      data: {
        emailVerifiedAt: new Date(),
        emailConfirmToken: null,
        emailConfirmExpira: null
      },
      include: { tenant: true }
    });
  },

  async reenviarConfirmacaoEmail(email) {
    const emailOk = assertEmailValido(email);
    const org = await prisma.organizador.findUnique({
      where: { email: emailOk },
      include: { tenant: true }
    });
    if (!org) return null;
    if (org.emailVerifiedAt) return { jaVerificado: true, org };

    const { token, expira } = tokenConfirmacaoEmail();
    const atualizado = await prisma.organizador.update({
      where: { id: org.id },
      data: { emailConfirmToken: token, emailConfirmExpira: expira },
      include: { tenant: true }
    });
    return { jaVerificado: false, org: atualizado };
  },

  async loginOrganizador(email, senha, tenantId) {
    const org = await prisma.organizador.findFirst({
      where: { email: email.toLowerCase(), tenantId: Number(tenantId) },
      include: { tenant: true }
    });
    if (!org || !org.senhaHash || !bcrypt.compareSync(senha, org.senhaHash)) return null;
    if (org.tenant.status === 'suspenso') throw new Error('Este sistema de rifas está suspenso.');
    if (!org.emailVerifiedAt) {
      const err = new Error('Confirme seu e-mail antes de acessar o painel.');
      err.code = 'EMAIL_NAO_VERIFICADO';
      err.email = org.email;
      throw err;
    }
    return org;
  },

  async loginOrganizadorGoogle({ googleId, email, tenantId, nome }) {
    let org = await prisma.organizador.findFirst({
      where: {
        tenantId: Number(tenantId),
        OR: [{ googleId }, { email: email.toLowerCase() }]
      },
      include: { tenant: true }
    });

    if (!org) return null;

    if (org.tenantId !== Number(tenantId)) {
      throw new Error('Esta conta Google pertence a outro sistema de rifas.');
    }

    if (org.tenant.status === 'suspenso') {
      throw new Error('Este sistema de rifas está suspenso.');
    }

    const patch = {};
    if (!org.googleId) {
      const googleEmUso = await prisma.organizador.findUnique({ where: { googleId } });
      if (googleEmUso && googleEmUso.id !== org.id) {
        throw new Error('Esta conta Google já está vinculada a outro organizador.');
      }
      patch.googleId = googleId;
      patch.nome = org.nome || nome;
    }
    if (!org.emailVerifiedAt) {
      patch.emailVerifiedAt = new Date();
      patch.emailConfirmToken = null;
      patch.emailConfirmExpira = null;
    }

    if (Object.keys(patch).length) {
      org = await prisma.organizador.update({
        where: { id: org.id },
        data: patch,
        include: { tenant: true }
      });
    }

    return org;
  },

  async loginOrganizadorPorEmail(email, senha) {
    const org = await prisma.organizador.findUnique({
      where: { email: email.toLowerCase() },
      include: { tenant: true }
    });
    if (!org || !org.senhaHash || !bcrypt.compareSync(senha, org.senhaHash)) return null;
    if (org.tenant.status === 'suspenso') throw new Error('Este sistema de rifas está suspenso.');
    if (!org.emailVerifiedAt) {
      const err = new Error('Confirme seu e-mail antes de acessar o painel.');
      err.code = 'EMAIL_NAO_VERIFICADO';
      err.email = org.email;
      throw err;
    }
    return org;
  },

  async loginOrganizadorGoogleGlobal({ googleId, email, nome }) {
    let org = await prisma.organizador.findFirst({
      where: { OR: [{ googleId }, { email: email.toLowerCase() }] },
      include: { tenant: true }
    });

    if (!org) return null;
    if (org.tenant.status === 'suspenso') {
      throw new Error('Este sistema de rifas está suspenso.');
    }

    const patch = {};
    if (!org.googleId) {
      const googleEmUso = await prisma.organizador.findUnique({ where: { googleId } });
      if (googleEmUso && googleEmUso.id !== org.id) {
        throw new Error('Esta conta Google já está vinculada a outro organizador.');
      }
      patch.googleId = googleId;
      patch.nome = org.nome || nome;
    }
    if (!org.emailVerifiedAt) {
      patch.emailVerifiedAt = new Date();
      patch.emailConfirmToken = null;
      patch.emailConfirmExpira = null;
    }

    if (Object.keys(patch).length) {
      org = await prisma.organizador.update({
        where: { id: org.id },
        data: patch,
        include: { tenant: true }
      });
    }

    return org;
  },

  async buscarOrganizador(id) {
    return prisma.organizador.findUnique({
      where: { id: Number(id) },
      include: { tenant: true }
    });
  },

  async buscarOuCriarConvidado({ nome, telefone, cpf, chavePix, email = null }) {
    const tel = limparTelefone(telefone);
    const cpfLimpo = limparCpf(cpf);
    if (!cpfValido(cpfLimpo)) throw new Error('CPF inválido.');

    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !EMAIL_RE.test(emailNorm)) {
      throw new Error('E-mail inválido.');
    }

    async function assertEmailDisponivel(usuarioId = null) {
      const outro = await prisma.usuario.findUnique({ where: { email: emailNorm } });
      if (outro && outro.id !== usuarioId) {
        throw new Error('Este e-mail já está vinculado a outra conta.');
      }
    }

    const porCpf = await prisma.usuario.findUnique({ where: { cpf: cpfLimpo } });
    if (porCpf) {
      if (porCpf.telefone !== tel) {
        const telEmUso = await prisma.usuario.findUnique({ where: { telefone: tel } });
        if (telEmUso && telEmUso.id !== porCpf.id) {
          throw new Error('Este WhatsApp já está vinculado a outro CPF.');
        }
      }
      await assertEmailDisponivel(porCpf.id);
      return prisma.usuario.update({
        where: { id: porCpf.id },
        data: { nome, telefone: tel, email: emailNorm, chavePix: chavePix || porCpf.chavePix }
      });
    }

    let usuario = await prisma.usuario.findUnique({ where: { telefone: tel } });

    if (usuario) {
      if (usuario.cpf && usuario.cpf !== cpfLimpo) {
        throw new Error('Este telefone já está vinculado a outro CPF.');
      }

      await assertEmailDisponivel(usuario.id);
      return prisma.usuario.update({
        where: { id: usuario.id },
        data: { nome, cpf: cpfLimpo, email: emailNorm, chavePix: chavePix || usuario.chavePix }
      });
    }

    await assertEmailDisponivel();

    let codigo = gerarCodigoIndicacao();
    while (await prisma.usuario.findUnique({ where: { codigoIndicacao: codigo } })) {
      codigo = gerarCodigoIndicacao();
    }

    return prisma.usuario.create({
      data: {
        nome,
        email: emailNorm,
        telefone: tel,
        cpf: cpfLimpo,
        chavePix: chavePix || null,
        codigoIndicacao: codigo
      }
    });
  }
};

module.exports = AuthService;
