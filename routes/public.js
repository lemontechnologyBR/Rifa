const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
router.get('/', publicController.index);
router.get('/encerradas', publicController.encerradas);
router.get('/como-funciona', publicController.comoFunciona);
router.get('/politica-de-privacidade', publicController.politicaPrivacidade);
router.get('/rifas/:id', publicController.detalhe);
router.get('/rifas/:id/resultado', publicController.resultado);
router.get('/minhas-reservas', publicController.minhasReservas);
router.post('/minhas-reservas', publicController.buscarReservas);
router.get('/comprovante/:id', publicController.comprovante);

module.exports = router;
