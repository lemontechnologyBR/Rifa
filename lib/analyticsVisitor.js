/**
 * Helpers para analytics de acesso (visitantes, dispositivo, origem).
 */
const crypto = require('crypto');
const { isSlugReservado } = require('./reservedSlugs');

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|tag assistant|gtmetrix|pingdom/i;

function parseCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setVisitorCookie(res, visitorId) {
  if (res.headersSent) return false;
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  const maxAge = 30 * 24 * 60 * 60;
  let cookie = `vf_vid=${encodeURIComponent(visitorId)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  if (secure) cookie += '; Secure';
  res.append('Set-Cookie', cookie);
  return true;
}

function getOrCreateVisitorId(req, res) {
  let vid = parseCookie(req, 'vf_vid');
  if (!vid && req.session) {
    if (!req.session.visitorId) {
      req.session.visitorId = crypto.randomUUID();
    }
    vid = req.session.visitorId;
  }
  if (!vid) {
    vid = crypto.randomUUID();
  }
  if (!parseCookie(req, 'vf_vid')) {
    setVisitorCookie(res, vid);
  }
  return vid;
}

function isBot(userAgent) {
  return BOT_RE.test(String(userAgent || ''));
}

function parseDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

function parseSource(referrer, utmSource) {
  if (utmSource) return String(utmSource).slice(0, 80).toLowerCase();
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
    if (/google\.|bing\.|yahoo\.|duckduckgo|yandex/.test(host)) return 'google';
    if (/facebook|instagram|twitter|t\.co|tiktok|linkedin|whatsapp/.test(host)) return 'social';
    if (host.includes('vourifar')) return 'direct';
    return host.slice(0, 80);
  } catch {
    return 'direct';
  }
}

function extractTenantSlug(pathname) {
  const seg = String(pathname || '/').split('/').filter(Boolean)[0];
  if (!seg || isSlugReservado(seg)) return null;
  return seg;
}

function extractRifaId(pathname) {
  const m = String(pathname || '').match(/\/rifas\/(\d+)(?:\/|$)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function sliceQuery(req, key, max = 80) {
  const v = req.query && req.query[key];
  if (v == null || v === '') return null;
  return String(Array.isArray(v) ? v[0] : v).slice(0, max);
}

function attributionFromRequest(req) {
  const utmSource = sliceQuery(req, 'utm_source');
  const utmMedium = sliceQuery(req, 'utm_medium');
  const utmCampaign = sliceQuery(req, 'utm_campaign');
  const utmContent = sliceQuery(req, 'utm_content');
  const utmTerm = sliceQuery(req, 'utm_term');
  const gclid = sliceQuery(req, 'gclid', 120);
  const referrer = (req.get && req.get('referer')) ? String(req.get('referer')).slice(0, 500) : null;
  return {
    referrer: referrer || null,
    source: parseSource(referrer, utmSource || (gclid ? 'google' : null)),
    utmSource: utmSource || (gclid ? 'google' : null),
    utmMedium: utmMedium || (gclid ? 'cpc' : null),
    utmCampaign,
    utmContent,
    utmTerm,
    gclid
  };
}

function shouldTrackRequest(req) {
  if (req.method !== 'GET') return false;
  const path = req.path || '/';
  if (/^\/(api|webhooks|health|super|auth|css|js|img|uploads|pwa-check)\b/.test(path)) return false;
  if (/\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|webmanifest|xml|txt|map)$/i.test(path)) return false;
  if (/\/admin(\/|$)/.test(path)) return false;
  if (path === '/sw.js' || path === '/manifest.webmanifest' || path === '/robots.txt' || path === '/sitemap.xml') return false;
  if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') return false;
  if (isBot(req.get('user-agent'))) return false;
  return true;
}

module.exports = {
  getOrCreateVisitorId,
  isBot,
  parseDevice,
  parseSource,
  extractTenantSlug,
  extractRifaId,
  sliceQuery,
  attributionFromRequest,
  shouldTrackRequest
};
