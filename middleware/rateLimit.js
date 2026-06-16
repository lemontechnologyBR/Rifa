/**
 * Rate limiting para proteção de rotas sensíveis.
 */

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { erro: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' }
});

const compraLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { erro: 'Limite de requisições de compra atingido.' }
});

module.exports = { apiLimiter, authLimiter, compraLimiter };
