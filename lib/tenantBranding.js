/** CSS de branding por tenant (cor primária, gradientes) */

function darkenHex(hex, amount = 0.15) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return hex || '#10b981';
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(parseInt(h.slice(0, 2), 16) * (1 - amount));
  const g = clamp(parseInt(h.slice(2, 4), 16) * (1 - amount));
  const b = clamp(parseInt(h.slice(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function cssVars(tenant, fallback = '#10b981') {
  const from = tenant?.corPrimaria || fallback;
  const to = darkenHex(from);
  return `--brand-from:${from};--brand-to:${to};--brand-accent:${from}`;
}

function cssBranding(tenant) {
  if (!tenant?.corPrimaria) return '';
  const cor = tenant.corPrimaria;
  const to = darkenHex(cor);
  return `:root{--brand-from:${cor};--brand-to:${to}}.btn-brand{background:linear-gradient(135deg,${cor},${to})}`;
}

module.exports = { cssVars, cssBranding, darkenHex };
