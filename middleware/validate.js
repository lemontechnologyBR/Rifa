/**
 * Middleware para tratar erros de validação do express-validator.
 */

const { validationResult } = require('express-validator');

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const mensagens = errors.array().map((e) => e.msg);

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ erro: mensagens.join(' ') });
    }

    // Para formulários HTML, repassa erros via flash-like query ou render
    req.validationErrors = mensagens;
  }
  next();
}

module.exports = { handleValidation };
