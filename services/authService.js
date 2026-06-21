/**
 * Serviço de autenticação — super-admin, organizadores e checkout.
 */
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { gerarCodigoIndicacao, limparTelefone, limparCpf, cpfValido } = require('../lib/helpers');

const AuthService = {
  async loginAdmin(usuario, senha) {
    const admin = await prisma.admin.findUnique({ where: { usuario } });
    if (!admin || !bcrypt.compareSync(senha, admin.senhaHash)) return null;
    return admin;
  },

  async garantirAdminPadrao() {
    const existe = await prisma.admin.findUnique({ where: { usuario: 'admin' } });
    if (!existe) {
      await prisma.admin.create({
        data: { usuario: 'admin', senhaHash: bcrypt.hashSync('admin123', 10) }
      });
      console.log('✅ Admin padrão criado (admin / admin123)');
    }
  },

  async registrarOrganizador({ tenantId, nome, email, senha }) {
    const existente = await prisma.organizador.findUnique({ where: { email: email.toLowerCase() } });
    if (existente) throw new Error('E-mail já cadastrado.');

    return prisma.organizador.create({
      data: {
        tenantId: Number(tenantId),
        nome,
        email: email.toLowerCase(),
        senhaHash: bcrypt.hashSync(senha, 10)
      },
      include: { tenant: true }
    });
  },

  async registrarOrganizadorGoogle({ tenantId, nome, email, googleId }) {
    const existente = await prisma.organizador.findUnique({ where: { email: email.toLowerCase() } });
    if (existente) throw new Error('E-mail já cadastrado.');

    const googleEmUso = await prisma.organizador.findUnique({ where: { googleId } });
    if (googleEmUso) throw new Error('Conta Google já vinculada a outro sistema.');

    return prisma.organizador.create({
      data: {
        tenantId: Number(tenantId),
        nome,
        email: email.toLowerCase(),
        googleId
      },
      include: { tenant: true }
    });
  },

  async loginOrganizador(email, senha, tenantId) {
    const org = await prisma.organizador.findFirst({
      where: { email: email.toLowerCase(), tenantId: Number(tenantId) },
      include: { tenant: true }
    });
    if (!org || !org.senhaHash || !bcrypt.compareSync(senha, org.senhaHash)) return null;
    if (org.tenant.status === 'suspenso') throw new Error('Este sistema de rifas está suspenso.');
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

    if (!org.googleId) {
      const googleEmUso = await prisma.organizador.findUnique({ where: { googleId } });
      if (googleEmUso && googleEmUso.id !== org.id) {
        throw new Error('Esta conta Google já está vinculada a outro organizador.');
      }

      org = await prisma.organizador.update({
        where: { id: org.id },
        data: { googleId, nome: org.nome || nome },
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

    if (!org.googleId) {
      const googleEmUso = await prisma.organizador.findUnique({ where: { googleId } });
      if (googleEmUso && googleEmUso.id !== org.id) {
        throw new Error('Esta conta Google já está vinculada a outro organizador.');
      }

      org = await prisma.organizador.update({
        where: { id: org.id },
        data: { googleId, nome: org.nome || nome },
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
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
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
