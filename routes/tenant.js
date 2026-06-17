const express = require('express');
const router = express.Router({ mergeParams: true });
const publicController = require('../controllers/publicController');
const organizadorController = require('../controllers/organizadorController');
const apiController = require('../controllers/apiController');
const googleAuthController = require('../controllers/googleAuthController');
const pwaController = require('../controllers/pwaController');
const { resolveTenant, requireOrganizador, carregarOrganizador } = require('../middleware/tenant');
const { authLimiter } = require('../middleware/rateLimit');
const { handleUploadRifaImagem } = require('../middleware/uploadRifaImagem');
const { validarRifa, validarReservar, validarCompra, validarWebhook, validarComentario } = require('../middleware/validators');
const { handleValidation } = require('../middleware/validate');

router.use(resolveTenant);

router.use((req, res, next) => {
  const slugPath = `/${req.tenant.slug}`;
  const urlPath = req.originalUrl.split('?')[0];
  if (urlPath === slugPath) {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `${slugPath}/${qs}`);
  }
  next();
});

router.get('/manifest.webmanifest', pwaController.tenantManifest);
router.get('/pwa-check', pwaController.audit);

// --- Público ---
router.get('/', publicController.index);
router.get('/encerradas', publicController.encerradas);
router.get('/como-funciona', publicController.comoFunciona);
router.get('/politica-de-privacidade', publicController.politicaPrivacidade);
router.get('/rifas/:id', publicController.detalhe);
router.get('/rifas/:id/resultado', publicController.resultado);
router.get('/minhas-reservas', publicController.minhasReservas);
router.post('/minhas-reservas', publicController.buscarReservas);
router.get('/comprovante/:id', publicController.comprovante);

// --- API ---
const api = express.Router();
api.use(require('../middleware/rateLimit').apiLimiter);
api.post('/rifas/:id/reservar', require('../middleware/rateLimit').compraLimiter, validarReservar, handleValidation, apiController.reservar);
api.delete('/rifas/:id/liberar', apiController.liberar);
api.post('/rifas/:id/renovar', require('../middleware/rateLimit').compraLimiter, validarReservar, handleValidation, apiController.renovar);
api.post('/rifas/:id/aleatorio', require('../middleware/rateLimit').compraLimiter, apiController.numerosAleatorios);
api.post('/rifas/:id/comprar', require('../middleware/rateLimit').compraLimiter, validarCompra, handleValidation, apiController.comprar);
api.post('/rifas/:id/comentarios', validarComentario, handleValidation, apiController.comentar);
api.get('/rifas/:id/numeros', apiController.statusNumeros);
api.get('/rifas/:id/carrinho', apiController.carrinho);
api.post('/pagamentos/webhook', validarWebhook, handleValidation, apiController.webhookPagamento);
api.post('/pagamentos/woovi', apiController.webhookWoovi);
api.post('/pagamentos/sincronizar', apiController.sincronizarPagamentos);
api.get('/reservas/:id/status', apiController.statusReserva);
router.use('/api', api);

// --- Admin organizador ---
const admin = express.Router();
admin.use(carregarOrganizador);
admin.get('/login', organizadorController.loginForm);
admin.get('/auth/google', googleAuthController.iniciarLoginTenant);
admin.post('/login', authLimiter, organizadorController.login);admin.get('/logout', organizadorController.logout);
admin.get('/', requireOrganizador, organizadorController.dashboard);
admin.get('/rifas', requireOrganizador, organizadorController.listarRifas);
admin.get('/carteira', requireOrganizador, organizadorController.carteiraForm);
admin.post('/carteira', requireOrganizador, organizadorController.salvarCarteira);
admin.post('/carteira/saque', requireOrganizador, organizadorController.solicitarSaque);
admin.get('/config', requireOrganizador, organizadorController.configForm);
admin.post('/config', requireOrganizador, organizadorController.salvarConfig);
admin.get('/logs', requireOrganizador, organizadorController.logs);
admin.post('/upload/imagem-rifa', requireOrganizador, handleUploadRifaImagem, organizadorController.uploadImagemRifa);
admin.get('/rifas/nova', requireOrganizador, organizadorController.novaRifaForm);
admin.post('/rifas/nova', requireOrganizador, validarRifa, handleValidation, organizadorController.criarRifa);
admin.get('/rifas/:id/editar', requireOrganizador, organizadorController.editarRifaForm);
admin.post('/rifas/:id/editar', requireOrganizador, validarRifa, handleValidation, organizadorController.atualizarRifa);
admin.get('/rifas/:id/participantes', requireOrganizador, organizadorController.participantes);
admin.get('/rifas/:id/exportar', requireOrganizador, organizadorController.exportarCSV);
admin.post('/rifas/:id/reservas/:reservaId/confirmar', requireOrganizador, organizadorController.confirmarPagamento);
admin.post('/rifas/:id/reservas/:reservaId/cancelar', requireOrganizador, organizadorController.cancelarReserva);
admin.post('/rifas/:id/sortear', requireOrganizador, organizadorController.sortear);
admin.post('/rifas/:id/excluir', requireOrganizador, organizadorController.excluirRifa);
router.use('/admin', admin);

module.exports = router;
