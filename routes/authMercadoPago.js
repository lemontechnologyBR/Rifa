const express = require('express');
const router = express.Router();
const mercadoPagoOAuthController = require('../controllers/mercadoPagoOAuthController');

router.get('/mercadopago/callback', mercadoPagoOAuthController.callback);

module.exports = router;
