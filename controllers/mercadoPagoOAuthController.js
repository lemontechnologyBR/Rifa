/**
 * OAuth Mercado Pago — conectar conta do organizador (marketplace split).
 */
const prisma = require('../lib/prisma');
const LogService = require('../services/logService');
const MercadoPagoOAuthService = require('../services/mercadoPagoOAuthService');

const mercadoPagoOAuthController = {
  async conectar(req, res) {
    try {
      if (!MercadoPagoOAuthService.isSplitConfigured()) {
        return res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent('Split Mercado Pago não configurado na plataforma.')}`);
      }

      const state = MercadoPagoOAuthService.encodeState({
        tenantId: req.tenant.id,
        tenantSlug: req.tenant.slug,
        organizadorId: req.session.organizadorId
      });

      res.redirect(MercadoPagoOAuthService.buildAuthUrl(req, state));
    } catch (err) {
      res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async callback(req, res) {
    const fallbackSlug = 'demo';
    try {
      const { code, state, error, error_description: errorDesc } = req.query;

      if (error) {
        throw new Error(String(errorDesc || error || 'Autorização cancelada.'));
      }
      if (!code || !state) {
        throw new Error('Resposta OAuth incompleta.');
      }

      const payload = MercadoPagoOAuthService.verifyState(String(state));
      const tokenData = await MercadoPagoOAuthService.exchangeCode(req, String(code), String(state));
      await MercadoPagoOAuthService.salvarTokens(payload.tenantId, tokenData);

      await LogService.registrar(
        'mercadopago',
        'mp_oauth_conectado',
        `Tenant #${payload.tenantId} — user ${tokenData.user_id}`,
        payload.tenantId
      );

      res.redirect(`/${payload.tenantSlug}/admin/carteira?msg=${encodeURIComponent('Conta Mercado Pago conectada! Pagamentos serão repassados automaticamente.')}`);
    } catch (err) {
      let slug = fallbackSlug;
      try {
        if (req.query.state) slug = MercadoPagoOAuthService.verifyState(String(req.query.state)).tenantSlug;
      } catch (_) { /* ignore */ }
      res.redirect(`/${slug}/admin/carteira?erro=${encodeURIComponent(err.message)}`);
    }
  },

  async desconectar(req, res) {
    try {
      await MercadoPagoOAuthService.desconectar(req.tenant.id);
      await LogService.registrar(
        req.session.organizadorNome || 'organizador',
        'mp_oauth_desconectado',
        `Tenant #${req.tenant.id}`,
        req.tenant.id
      );
      res.redirect(`/${req.tenant.slug}/admin/carteira?msg=${encodeURIComponent('Conta Mercado Pago desvinculada.')}`);
    } catch (err) {
      res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent(err.message)}`);
    }
  }
};

module.exports = mercadoPagoOAuthController;
