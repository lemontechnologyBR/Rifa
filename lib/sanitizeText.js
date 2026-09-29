/**
 * Sanitização de textos exibidos (anti-XSS / injection em nomes).
 */
const { xssReject } = require('./trollMessages');

const HTML_INJECTION_RE = /<|>|`|\{|\}|javascript\s*:|data\s*:|vbscript\s*:|on\w+\s*=|<script|<\/script|&#|\\x[0-9a-f]{2}/i;

function limparEspacos(texto) {
  return String(texto || '').trim().replace(/\s+/g, ' ');
}

function stripTags(texto) {
  return String(texto || '').replace(/<[^>]*>/g, '');
}

/**
 * Nome de pessoa / organizador — letras e pontuação simples.
 */
function assertNomePessoa(nome) {
  const n = limparEspacos(nome);
  if (n.length < 2 || n.length > 80) {
    throw new Error('Nome inválido. Use entre 2 e 80 caracteres.');
  }
  if (HTML_INJECTION_RE.test(n) || !/^[\p{L}\p{M}\s'.-]+$/u.test(n)) {
    const err = new Error(xssReject());
    err.code = 'XSS_REJECT';
    throw err;
  }
  return n;
}

/**
 * Nome da loja — permite números, mas bloqueia HTML/JS.
 * Valida o input bruto (antes do strip) para rejeitar payloads com troll.
 */
function assertNomeLoja(nome) {
  const raw = limparEspacos(nome);
  if (HTML_INJECTION_RE.test(raw) || /https?:\/\//i.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) {
    const err = new Error(xssReject());
    err.code = 'XSS_REJECT';
    throw err;
  }
  const n = limparEspacos(stripTags(raw));
  if (n.length < 2 || n.length > 80) {
    throw new Error('Nome da loja inválido. Use entre 2 e 80 caracteres.');
  }
  return n;
}

module.exports = {
  limparEspacos,
  stripTags,
  assertNomePessoa,
  assertNomeLoja,
  HTML_INJECTION_RE
};
