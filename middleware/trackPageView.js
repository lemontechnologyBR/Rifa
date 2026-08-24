/**
 * Middleware — registra pageviews de páginas públicas (fire-and-forget).
 */
const AnalyticsService = require('../services/analyticsService');
const {
  getOrCreateVisitorId,
  parseDevice,
  attributionFromRequest,
  extractTenantSlug,
  extractRifaId,
  shouldTrackRequest
} = require('../lib/analyticsVisitor');

module.exports = function trackPageView(req, res, next) {
  if (!shouldTrackRequest(req)) return next();

  const path = (req.originalUrl || req.path || '/').split('?')[0].slice(0, 500);
  const userAgent = req.get('user-agent') || '';
  const attr = attributionFromRequest(req);
  const rifaId = extractRifaId(path);

  // Cookie precisa ser definido ANTES da resposta ser enviada
  const visitorId = getOrCreateVisitorId(req, res);

  const payload = {
    path,
    tenantSlug: extractTenantSlug(path),
    rifaId,
    visitorId,
    referrer: attr.referrer,
    source: attr.source,
    device: parseDevice(userAgent),
    utmSource: attr.utmSource,
    utmMedium: attr.utmMedium,
    utmCampaign: attr.utmCampaign,
    utmContent: attr.utmContent,
    utmTerm: attr.utmTerm,
    gclid: attr.gclid
  };

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 500) return;
    AnalyticsService.registrar(payload).catch((err) => {
      console.error('[Analytics] Erro ao registrar:', err.message);
    });
    if (rifaId) {
      AnalyticsService.registrarEvento({
        event: AnalyticsService.EVENTOS.RIFA_VIEW,
        visitorId,
        tenantSlug: payload.tenantSlug,
        rifaId,
        source: payload.source,
        utmSource: payload.utmSource,
        utmCampaign: payload.utmCampaign
      }).catch(() => {});
    }
  });

  next();
};
