/**
 * Branding efetivo da rifa (campos próprios ou fallback do tenant).
 */
const { cssVars, darkenHex } = require('./tenantBranding');

function brandingEfetivo(rifa, tenant) {
  const cor = rifa?.corPrimaria || tenant?.corPrimaria || '#10b981';
  const corDark = darkenHex(cor);
  return {
    corPrimaria: cor,
    logoUrl: tenant?.logoUrl || null,
    whatsapp: tenant?.whatsapp || null,
    instagram: tenant?.instagram || null,
    cssVars: cssVars({ corPrimaria: cor }),
    corDark
  };
}

function anexarBrandingRifas(rifas, tenant) {
  return rifas.map((rifa) => ({
    ...rifa,
    brand: brandingEfetivo(rifa, tenant)
  }));
}

module.exports = { brandingEfetivo, anexarBrandingRifas };
