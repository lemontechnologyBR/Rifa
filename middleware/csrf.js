/**
 * Proteção CSRF via token em sessão.
 */

const crypto = require('crypto');

function gerarTokenCSRF(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

/** Disponibiliza token CSRF para templates e APIs */
function csrfToken(req, res, next) {
  res.locals.csrfToken = gerarTokenCSRF(req);
  next();
}

/** Valida token em requisições POST/PUT/DELETE (formulários e AJAX) */
function validarCSRF(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Webhook e APIs externas não usam CSRF de sessão
  if (req.originalUrl.includes('/api/pagamentos/webhook')) return next();
  if (req.originalUrl.includes('/api/pagamentos/woovi')) return next();
  if (req.originalUrl.includes('/api/pagamentos/sincronizar')) return next();
  if (req.originalUrl.includes('/webhooks/woovi')) return next();
  if (req.originalUrl.includes('/webhooks/mercadopago')) return next();
  if (req.originalUrl.includes('/auth/mercadopago/callback')) return next();

  const token = req.body?._csrf || req.headers['x-csrf-token'];

  if (!token || token !== req.session?.csrfToken) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ erro: 'Token CSRF inválido. Recarregue a página.' });
    }
    return res.status(403).send('Token CSRF inválido. Recarregue a página e tente novamente.');
  }

  next();
}

module.exports = { csrfToken, validarCSRF, gerarTokenCSRF };
