/**
 * OAuth Mercado Pago — conectar conta do organizador (marketplace split).
 */
const LogService = require('../services/logService');
const MercadoPagoOAuthService = require('../services/mercadoPagoOAuthService');

function erroAmigavel(err, query = {}) {
  const code = String(query.error || '').toLowerCase();
  if (code === 'access_denied') {
    return 'Autorização cancelada. Clique em Conectar conta para tentar de novo.';
  }
  const msg = String(err?.message || err || '');
  if (/redirect_uri|invalid_grant/i.test(msg)) {
    return 'Não foi possível conectar agora. Tente novamente em alguns minutos.';
  }
  if (/expirada|state/i.test(msg)) {
    return 'A autorização expirou. Clique em Conectar conta e tente de novo.';
  }
  return 'Não foi possível conectar sua conta Mercado Pago. Tente novamente.';
}

const mercadoPagoOAuthController = {
  async conectar(req, res) {
    try {
      if (!MercadoPagoOAuthService.isSplitConfigured()) {
        return res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent('Pagamentos temporariamente indisponíveis.')}`);
      }

      let pkce = null;
      const statePayload = {
        tenantId: req.tenant.id,
        tenantSlug: req.tenant.slug,
        organizadorId: req.session.organizadorId
      };
      if (MercadoPagoOAuthService.usePkce()) {
        pkce = MercadoPagoOAuthService.createPkce();
        statePayload.pkceVerifier = pkce.verifier;
      }

      const state = MercadoPagoOAuthService.encodeState(statePayload);
      res.redirect(MercadoPagoOAuthService.buildAuthUrl(req, state, pkce?.challenge || null));
    } catch (err) {
      res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent(erroAmigavel(err))}`);
    }
  },

  async callback(req, res) {
    const fallbackSlug = 'demo';
    try {
      const { code, state, error, error_description: errorDesc } = req.query;

      if (error) {
        throw new Error(String(errorDesc || error || 'access_denied'));
      }
      if (!code || !state) {
        throw new Error('Resposta OAuth incompleta.');
      }

      const payload = MercadoPagoOAuthService.verifyState(String(state));
      const tokenData = await MercadoPagoOAuthService.exchangeCode(
        req,
        String(code),
        String(state),
        payload.pkceVerifier || null
      );
      await MercadoPagoOAuthService.salvarTokens(payload.tenantId, tokenData);

      await LogService.registrar(
        'mercadopago',
        'mp_oauth_conectado',
        `Tenant #${payload.tenantId} — user ${tokenData.user_id}`,
        payload.tenantId
      );

      res.redirect(`/${payload.tenantSlug}/admin/carteira?msg=${encodeURIComponent('Conta Mercado Pago conectada! Seus pagamentos serão repassados automaticamente.')}`);
    } catch (err) {
      let slug = fallbackSlug;
      try {
        if (req.query.state) slug = MercadoPagoOAuthService.verifyState(String(req.query.state)).tenantSlug;
      } catch (_) { /* ignore */ }
      console.error('[MP OAuth] callback erro:', err.message);
      res.redirect(`/${slug}/admin/carteira?erro=${encodeURIComponent(erroAmigavel(err, req.query))}`);
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
      res.redirect(`/${req.tenant.slug}/admin/carteira?erro=${encodeURIComponent(erroAmigavel(err))}`);
    }
  }
};

module.exports = mercadoPagoOAuthController;
