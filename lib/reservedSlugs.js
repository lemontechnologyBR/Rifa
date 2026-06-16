/** Slugs reservados — não podem ser usados por tenants */
const RESERVED_SLUGS = new Set([
  'cadastro', 'super', 'api', 'admin', 'static', 'css', 'js', 'favicon.ico',
  'health', 'webhook', 'platform', 'login', 'logout', 'auth', 'conta', 'acessar'
]);

function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 48) || 'loja';
}

function isSlugReservado(slug) {
  return RESERVED_SLUGS.has(slug?.toLowerCase());
}

module.exports = { RESERVED_SLUGS, slugify, isSlugReservado };
