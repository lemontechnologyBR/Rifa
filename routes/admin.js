const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { validarRifa } = require('../middleware/validators');
const { handleValidation } = require('../middleware/validate');

router.get('/login', adminController.loginForm);
router.post('/login', authLimiter, adminController.login);
router.get('/logout', adminController.logout);

router.get('/', requireAdmin, adminController.dashboard);
router.get('/logs', requireAdmin, adminController.logs);
router.get('/rifas/nova', requireAdmin, adminController.novaRifaForm);
router.post('/rifas/nova', requireAdmin, validarRifa, handleValidation, adminController.criarRifa);
router.get('/rifas/:id/editar', requireAdmin, adminController.editarRifaForm);
router.post('/rifas/:id/editar', requireAdmin, validarRifa, handleValidation, adminController.atualizarRifa);
router.get('/rifas/:id/participantes', requireAdmin, adminController.participantes);
router.get('/rifas/:id/exportar', requireAdmin, adminController.exportarCSV);
router.post('/rifas/:id/reservas/:reservaId/confirmar', requireAdmin, adminController.confirmarPagamento);
router.post('/rifas/:id/reservas/:reservaId/cancelar', requireAdmin, adminController.cancelarReserva);
router.post('/rifas/:id/sortear', requireAdmin, adminController.sortear);
router.post('/rifas/:id/excluir', requireAdmin, adminController.excluirRifa);

module.exports = router;
