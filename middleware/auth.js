/**
 * Middleware de autenticação — admin.
 */

function requireAdmin(req, res, next) {
  if (req.session?.adminLogado) return next();

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ erro: 'Não autorizado. Faça login como admin.' });
  }
  return res.redirect('/super/login');
}

function carregarUsuario(req, res, next) {
  res.locals.adminLogado = !!req.session?.adminLogado;
  next();
}

module.exports = { requireAdmin, carregarUsuario };
