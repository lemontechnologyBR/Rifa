const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platformController');
const googleAuthController = require('../controllers/googleAuthController');
const apiController = require('../controllers/apiController');
const { authLimiter } = require('../middleware/rateLimit');

router.get('/', platformController.landing);
router.get('/acessar', platformController.acessarForm);
router.get('/acessar/auth/google', googleAuthController.iniciarAcessar);
router.post('/acessar', authLimiter, platformController.acessar);
router.get('/cadastro', platformController.cadastroForm);
router.get('/cadastro/auth/google', googleAuthController.iniciarCadastro);
router.post('/cadastro', platformController.cadastro);
router.post('/webhooks/woovi', apiController.webhookWoovi);
router.post('/webhooks/mercadopago', apiController.webhookMercadoPago);
router.get('/webhooks/mercadopago', apiController.webhookMercadoPago);

module.exports = router;
