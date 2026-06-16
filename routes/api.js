const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { apiLimiter, compraLimiter } = require('../middleware/rateLimit');
const { validarReservar, validarCompra, validarWebhook } = require('../middleware/validators');
const { handleValidation } = require('../middleware/validate');

router.use(apiLimiter);

router.post('/rifas/:id/reservar', compraLimiter, validarReservar, handleValidation, apiController.reservar);
router.delete('/rifas/:id/liberar', apiController.liberar);
router.post('/rifas/:id/renovar', compraLimiter, validarReservar, handleValidation, apiController.renovar);
router.post('/rifas/:id/aleatorio', compraLimiter, apiController.numerosAleatorios);
router.post('/rifas/:id/comprar', compraLimiter, validarCompra, handleValidation, apiController.comprar);
router.get('/rifas/:id/numeros', apiController.statusNumeros);
router.get('/rifas/:id/carrinho', apiController.carrinho);
router.post('/pagamentos/webhook', validarWebhook, handleValidation, apiController.webhookPagamento);
router.get('/reservas/:id/status', apiController.statusReserva);

module.exports = router;
