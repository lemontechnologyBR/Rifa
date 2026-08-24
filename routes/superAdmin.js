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
router.post('/rifas/:id/excluir', requireAdmin, superAdminController.excluirRifa);
router.get('/vendas', requireAdmin, superAdminController.vendas);
router.get('/organizadores', requireAdmin, superAdminController.organizadores);
router.post('/organizadores/campanha-leads-quentes', requireAdmin, superAdminController.campanhaLeadsQuentes);
router.post('/organizadores/:id/nurture-email', requireAdmin, superAdminController.enviarNurtureOrganizador);
router.post('/organizadores/:id/kyc-reset', requireAdmin, superAdminController.resetarKyc);
router.get('/organizadores/:id/kyc', requireAdmin, superAdminController.kycDetalhe);
router.get('/plataforma', requireAdmin, superAdminController.plataforma);
router.get('/marketing', requireAdmin, superAdminController.marketing);
router.post('/marketing', requireAdmin, superAdminController.salvarMarketing);
router.get('/operacoes', requireAdmin, superAdminController.operacoes);
router.post('/operacoes/comunicados', requireAdmin, superAdminController.enviarComunicado);
router.post('/operacoes/ferramentas/ads', requireAdmin, superAdminController.salvarMarketing);
router.get('/saques', requireAdmin, superAdminController.saques);
router.get('/analytics', requireAdmin, superAdminController.analytics);
router.post('/tenants/:id/status', requireAdmin, superAdminController.alterarStatus);
router.post('/tenants/:id/saldo-bloqueado', requireAdmin, superAdminController.alterarSaldoBloqueado);

module.exports = router;
