/** Atalhos de quantidade (+10, +50…) na página pública do sorteio. */

const PACOTES_RAPIDOS_PADRAO = [10, 50, 100];

function parsePacotesRapidos(stored) {
  if (stored == null || stored === '') return [...PACOTES_RAPIDOS_PADRAO];
  try {
    const arr = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (!Array.isArray(arr)) return [...PACOTES_RAPIDOS_PADRAO];
    const nums = arr
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const uniq = [...new Set(nums)].slice(0, 3);
    return uniq.length ? uniq : [...PACOTES_RAPIDOS_PADRAO];
  } catch (_) {
    return [...PACOTES_RAPIDOS_PADRAO];
  }
}

function serializePacotesRapidos(list) {
  return JSON.stringify(parsePacotesRapidos(list));
}

function parsePacotesRapidosFromBody(body) {
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const v = body[`pacote_rapido_${i}`];
    if (v === '' || v == null) continue;
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  if (out.length) return [...new Set(out)].slice(0, 3);
  if (body.pacote_rapido_qtd) {
    const raw = Array.isArray(body.pacote_rapido_qtd) ? body.pacote_rapido_qtd : [body.pacote_rapido_qtd];
    raw.forEach((v) => {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.push(n);
    });
    if (out.length) return [...new Set(out)].slice(0, 3);
  }
  return [...PACOTES_RAPIDOS_PADRAO];
}

module.exports = {
  PACOTES_RAPIDOS_PADRAO,
  parsePacotesRapidos,
  serializePacotesRapidos,
  parsePacotesRapidosFromBody
};
