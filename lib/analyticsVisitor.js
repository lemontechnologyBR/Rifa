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
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  const maxAge = 30 * 24 * 60 * 60;
  let cookie = `vf_vid=${encodeURIComponent(visitorId)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  if (secure) cookie += '; Secure';
  res.append('Set-Cookie', cookie);
}

function getOrCreateVisitorId(req, res) {
  let vid = parseCookie(req, 'vf_vid');
  if (!vid) {
    vid = crypto.randomUUID();
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
  shouldTrackRequest
};
