/**
 * 2FA por e-mail para o Super Admin.
 */
const crypto = require('crypto');
const { enviarEmail } = require('./emailService');
const { templateSuperAdmin2fa } = require('./emailTemplates');

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function destinoEmail2fa(usuario) {
  const override = String(process.env.SUPER_ADMIN_2FA_EMAIL || '').trim().toLowerCase();
  if (override && override.includes('@')) return override;
  const u = String(usuario || '').trim().toLowerCase();
  if (u.includes('@')) return u;
  throw new Error('Configure SUPER_ADMIN_2FA_EMAIL (ou use um e-mail em SUPER_ADMIN_USER).');
}

function gerarCodigo() {
  return String(crypto.randomInt(100000, 999999));
}

function hashCodigo(codigo) {
  const salt = process.env.SESSION_SECRET || 'vourifar-2fa';
  return crypto.createHash('sha256').update(`${codigo}:${salt}`).digest('hex');
}

function mascararEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!user || !domain) return '***';
  const visivel = user.slice(0, Math.min(2, user.length));
  return `${visivel}${'*'.repeat(Math.max(3, user.length - 2))}@${domain}`;
}

function limpar2fa(session) {
  delete session.admin2fa;
}

async function iniciar2fa(session, admin) {
  const para = destinoEmail2fa(admin.usuario);
  const codigo = gerarCodigo();
  const agora = Date.now();

  session.adminLogado = false;
  session.adminUsuario = null;
  session.admin2fa = {
    usuario: admin.usuario,
    email: para,
    hash: hashCodigo(codigo),
    expira: agora + TTL_MS,
    attempts: 0,
    sentAt: agora
  };

  await enviarEmail({
    para,
    assunto: `Código Super Admin: ${codigo}`,
    html: templateSuperAdmin2fa({ codigo, usuario: admin.usuario, minutos: 10 }),
    texto: `Seu código Super Admin VouRifar: ${codigo}\nVálido por 10 minutos.`,
    obrigatorio: true
  });

  return { emailMascarado: mascararEmail(para) };
}

async function reenviar2fa(session) {
  const state = session.admin2fa;
  if (!state) throw new Error('Nenhum login pendente. Faça login novamente.');
  const agora = Date.now();
  if (agora - (state.sentAt || 0) < RESEND_COOLDOWN_MS) {
    const secs = Math.ceil((RESEND_COOLDOWN_MS - (agora - state.sentAt)) / 1000);
    throw new Error(`Aguarde ${secs}s para reenviar o código.`);
  }
  if (agora > state.expira) {
    limpar2fa(session);
    throw new Error('Código expirado. Faça login novamente.');
  }

  const codigo = gerarCodigo();
  state.hash = hashCodigo(codigo);
  state.expira = agora + TTL_MS;
  state.sentAt = agora;
  state.attempts = 0;

  await enviarEmail({
    para: state.email,
    assunto: `Código Super Admin: ${codigo}`,
    html: templateSuperAdmin2fa({ codigo, usuario: state.usuario, minutos: 10 }),
    texto: `Seu código Super Admin VouRifar: ${codigo}\nVálido por 10 minutos.`,
    obrigatorio: true
  });

  return { emailMascarado: mascararEmail(state.email) };
}

function verificar2fa(session, codigoRaw) {
  const state = session.admin2fa;
  if (!state) {
    return { ok: false, erro: 'Nenhum login pendente. Faça login novamente.', reset: true };
  }
  if (Date.now() > state.expira) {
    limpar2fa(session);
    return { ok: false, erro: 'Código expirado. Faça login novamente.', reset: true };
  }

  state.attempts = (state.attempts || 0) + 1;
  if (state.attempts > MAX_ATTEMPTS) {
    limpar2fa(session);
    return { ok: false, erro: 'Muitas tentativas. Faça login novamente.', reset: true };
  }

  const codigo = String(codigoRaw || '').replace(/\D/g, '');
  if (codigo.length !== 6 || hashCodigo(codigo) !== state.hash) {
    return { ok: false, erro: 'Código inválido.', reset: false };
  }

  const usuario = state.usuario;
  limpar2fa(session);
  return { ok: true, usuario };
}

module.exports = {
  iniciar2fa,
  reenviar2fa,
  verificar2fa,
  limpar2fa,
  mascararEmail,
  TTL_MS,
  MAX_ATTEMPTS
};
