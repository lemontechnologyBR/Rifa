/**
 * Normalização e validação de chaves PIX (cadastro tenant).
 */
const { cpfValido } = require('./helpers');

const TIPOS_PIX = {
  cpf: { label: 'CPF', placeholder: '000.000.000-00', hint: 'Somente números do CPF (11 dígitos).' },
  cnpj: { label: 'CNPJ', placeholder: '00.000.000/0000-00', hint: 'CNPJ da empresa (14 dígitos).' },
  email: { label: 'E-mail', placeholder: 'seu@email.com', hint: 'E-mail cadastrado como chave PIX no banco.' },
  telefone: { label: 'Telefone', placeholder: '(11) 99999-8888', hint: 'Celular com DDD. Pode incluir +55.' },
  aleatoria: { label: 'Chave aleatória', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Chave EVP (UUID) gerada no app do banco.' }
};

function compactarChaveAleatoria(chave) {
  return String(chave || '').trim().replace(/[\s-]/g, '').toLowerCase();
}

/** Chave aleatória PIX (EVP) — UUID 32 hex, com ou sem hífens */
function isChaveAleatoria(chave) {
  const raw = String(chave || '').trim();
  if (!raw || raw.includes('@')) return false;

  const compact = compactarChaveAleatoria(raw);
  if (/^[0-9a-f]{32}$/.test(compact)) return true;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
}

function normalizarTelefonePix(digits) {
  if (digits.length === 10) return `55${digits}`;
  if (digits.length === 11 && digits.charAt(2) === '9') return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

function dddValido(digits) {
  if (digits.length < 2) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  return ddd >= 11 && ddd <= 99;
}

function detectarTipoChavePix(chave) {
  const raw = String(chave || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return 'email';
  if (isChaveAleatoria(raw)) return 'aleatoria';

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 14) return 'cnpj';
  if (digits.length === 11 && cpfValido(digits)) return 'cpf';
  if (normalizarTelefonePix(digits) && dddValido(digits)) return 'telefone';

  return null;
}

function labelTipoPix(tipo) {
  return TIPOS_PIX[tipo]?.label || 'Chave PIX';
}

function validarChavePixPorTipo(tipo, chave) {
  const raw = String(chave || '').trim();
  if (!raw) throw new Error('Informe sua chave PIX.');

  const t = String(tipo || '').toLowerCase();
  if (!TIPOS_PIX[t]) throw new Error('Selecione o tipo da chave PIX.');

  switch (t) {
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        throw new Error('Informe um e-mail válido para a chave PIX.');
      }
      break;
    case 'cpf': {
      const digits = raw.replace(/\D/g, '');
      if (!cpfValido(digits)) {
        throw new Error('CPF inválido. Confira os 11 dígitos.');
      }
      break;
    }
    case 'cnpj': {
      const digits = raw.replace(/\D/g, '');
      if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
        throw new Error('CNPJ inválido. Informe os 14 dígitos.');
      }
      break;
    }
    case 'telefone': {
      const digits = raw.replace(/\D/g, '');
      if (!dddValido(digits)) {
        throw new Error('Telefone inválido. Informe o DDD (ex: 11 99999-8888).');
      }
      if (!normalizarTelefonePix(digits)) {
        throw new Error('Telefone inválido. Use celular com 9 dígitos ou fixo com 8.');
      }
      if (digits.length === 11 && cpfValido(digits) && digits.charAt(2) !== '9') {
        throw new Error('Este número parece um CPF. Selecione o tipo CPF.');
      }
      break;
    }
    case 'aleatoria':
      if (!isChaveAleatoria(raw)) {
        throw new Error('Chave aleatória inválida. Cole a chave EVP do seu banco.');
      }
      break;
    default:
      break;
  }

  return formatarChavePixSalvar(t, raw);
}

function formatarChavePixSalvar(tipo, chave) {
  const raw = String(chave || '').trim();
  switch (tipo) {
    case 'email':
      return raw.toLowerCase();
    case 'cpf':
    case 'cnpj':
      return raw.replace(/\D/g, '');
    case 'telefone':
      return raw.replace(/\D/g, '');
    case 'aleatoria':
      return compactarChaveAleatoria(raw);
    default:
      return raw;
  }
}

function normalizarChavePix(chave) {
  const raw = String(chave || '').trim();
  if (!raw) return '';

  if (raw.includes('@')) {
    return raw.toLowerCase();
  }

  if (isChaveAleatoria(raw)) {
    return compactarChaveAleatoria(raw);
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return raw.toLowerCase();
  }

  if (digits.length === 11 && cpfValido(digits)) {
    return digits;
  }

  if (digits.length === 14) {
    return digits;
  }

  const tel = normalizarTelefonePix(digits);
  if (tel) return tel;

  return digits;
}

function chavesPixEquivalentes(a, b) {
  if (!a || !b) return false;

  const na = normalizarChavePix(a);
  const nb = normalizarChavePix(b);
  if (na === nb) return true;

  const rawA = String(a).trim().toLowerCase();
  const rawB = String(b).trim().toLowerCase();
  if (rawA === rawB) return true;

  const da = String(a).replace(/\D/g, '');
  const db = String(b).replace(/\D/g, '');
  if (da && db && da === db) return true;

  const ta = da ? normalizarTelefonePix(da) : null;
  const tb = db ? normalizarTelefonePix(db) : null;
  if (ta && tb && ta === tb) return true;

  return compactarChaveAleatoria(a) === compactarChaveAleatoria(b);
}

module.exports = {
  TIPOS_PIX,
  normalizarChavePix,
  chavesPixEquivalentes,
  isChaveAleatoria,
  detectarTipoChavePix,
  labelTipoPix,
  validarChavePixPorTipo,
  formatarChavePixSalvar
};
