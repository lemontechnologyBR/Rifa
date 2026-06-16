/**
 * Utilitários de URL — compatível com ngrok e proxies reversos.
 */

/** URL base da requisição atual (sempre o host real do browser) */
function getBaseUrl(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`.replace(/\/$/, '');
}

/** APP_URL do .env — use só para OAuth/webhooks, não para PWA */
function getAppUrl(req) {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  return getBaseUrl(req);
}

/** Headers extras para contornar página de aviso do ngrok free */
function getNgrokHeaders() {
  return {
    'ngrok-skip-browser-warning': 'true',
    'X-Requested-With': 'XMLHttpRequest'
  };
}

module.exports = { getBaseUrl, getAppUrl, getNgrokHeaders };
