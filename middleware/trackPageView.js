/**
 * Middleware — registra pageviews de páginas públicas (fire-and-forget).
 */
const AnalyticsService = require('../services/analyticsService');
const {
  getOrCreateVisitorId,
  parseDevice,
  parseSource,
  extractTenantSlug,
  shouldTrackRequest
} = require('../lib/analyticsVisitor');

module.exports = function trackPageView(req, res, next) {
  if (!shouldTrackRequest(req)) return next();

  const path = (req.path || '/').slice(0, 500);
  const referrer = (req.get('referer') || '').slice(0, 500) || null;
  const utmSource = req.query.utm_source ? String(req.query.utm_source).slice(0, 80) : null;
  const utmMedium = req.query.utm_medium ? String(req.query.utm_medium).slice(0, 80) : null;
  const utmCampaign = req.query.utm_campaign ? String(req.query.utm_campaign).slice(0, 80) : null;
  const userAgent = req.get('user-agent') || '';

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 500) return;

    try {
      const visitorId = getOrCreateVisitorId(req, res);
      AnalyticsService.registrar({
        path,
        tenantSlug: extractTenantSlug(path),
        visitorId,
        referrer,
        source: parseSource(referrer, utmSource),
        device: parseDevice(userAgent),
        utmSource,
        utmMedium,
        utmCampaign
      }).catch((err) => console.error('[Analytics] Erro ao registrar:', err.message));
    } catch (err) {
      console.error('[Analytics] Erro no tracking:', err.message);
    }
  });

  next();
};
