const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { requireAdmin } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

router.get('/login', superAdminController.loginForm);
router.post('/login', authLimiter, superAdminController.login);
router.get('/logout', superAdminController.logout);

router.get('/', requireAdmin, superAdminController.dashboard);
router.get('/sistemas', requireAdmin, superAdminController.sistemas);
router.get('/rifas', requireAdmin, superAdminController.rifas);
router.get('/vendas', requireAdmin, superAdminController.vendas);
router.get('/organizadores', requireAdmin, superAdminController.organizadores);
router.post('/organizadores/campanha-leads-quentes', requireAdmin, superAdminController.campanhaLeadsQuentes);
router.post('/organizadores/:id/nurture-email', requireAdmin, superAdminController.enviarNurtureOrganizador);
router.get('/plataforma', requireAdmin, superAdminController.plataforma);
router.get('/marketing', requireAdmin, superAdminController.marketing);
router.post('/marketing', requireAdmin, superAdminController.salvarMarketing);
router.get('/saques', requireAdmin, superAdminController.saques);
router.get('/analytics', requireAdmin, superAdminController.analytics);
router.post('/tenants/:id/status', requireAdmin, superAdminController.alterarStatus);

module.exports = router;
