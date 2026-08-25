const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platformController');
const googleAuthController = require('../controllers/googleAuthController');
const apiController = require('../controllers/apiController');
const { authLimiter } = require('../middleware/rateLimit');

router.get('/', platformController.landing);
router.get('/ajuda', platformController.ajudaIndex);
router.get('/ajuda/:slug', platformController.ajudaArtigo);
router.get('/acessar', platformController.acessarForm);
router.get('/acessar/auth/google', googleAuthController.iniciarAcessar);
router.post('/acessar', authLimiter, platformController.acessar);
router.get('/cadastro', platformController.cadastroForm);
router.get('/cadastro/auth/google', googleAuthController.iniciarCadastro);
router.post('/cadastro', platformController.cadastro);
router.post('/webhooks/woovi', apiController.webhookWoovi);
router.post('/webhooks/didit', apiController.webhookDidit);

module.exports = router;
