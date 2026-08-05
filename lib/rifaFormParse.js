/** Parse de formulários admin (imagens e faixas de desconto). */

const FAIXA_PCT_OPCOES = [10, 15, 20, 25, 30, 40, 50];

function parseImagensUrls(body) {
  const urls = [];
  if (body.imagens_urls) {
    const raw = Array.isArray(body.imagens_urls) ? body.imagens_urls : [body.imagens_urls];
    raw.forEach((u) => {
      const s = String(u || '').trim();
      if (s) urls.push(s);
    });
  }
  if (body.imagens_urls_json) {
    try {
      const parsed = JSON.parse(String(body.imagens_urls_json));
      if (Array.isArray(parsed)) {
        parsed.forEach((u) => {
          const s = String(u || '').trim();
          if (s) urls.push(s);
        });
      }
    } catch (_) { /* ignore */ }
  }
  const capa = String(body.imagem_url || '').trim();
  if (capa && !urls.includes(capa)) urls.unshift(capa);
  return [...new Set(urls)].slice(0, 12);
}

function parseFaixas(body) {
  const faixas = [];
  const ativos = body.faixa_pct_ativo;
  const ativoSet = new Set(
    Array.isArray(ativos) ? ativos.map(String) : ativos ? [String(ativos)] : []
  );

  const sugestaoQtd = { 10: 5, 15: 8, 20: 10, 25: 15, 30: 20, 40: 30, 50: 50 };

  for (const pct of FAIXA_PCT_OPCOES) {
    const rawQ = body[`faixa_pct_qtd_${pct}`];
    let qtd = parseInt(rawQ, 10);
    const marcado = ativoSet.has(String(pct));
    if (!marcado && (!Number.isFinite(qtd) || qtd <= 0)) continue;
    if (!Number.isFinite(qtd) || qtd <= 0) qtd = sugestaoQtd[pct] || pct;
    if (qtd > 0) faixas.push({ quantidade_min: qtd, percentual_desconto: pct });
  }

  if (faixas.length) {
    faixas.sort((a, b) => a.quantidade_min - b.quantidade_min);
    return faixas;
  }

  if (body.faixa_qtd) {
    const qtds = Array.isArray(body.faixa_qtd) ? body.faixa_qtd : [body.faixa_qtd];
    const vals = Array.isArray(body.faixa_valor) ? body.faixa_valor : [body.faixa_valor];
    qtds.forEach((q, i) => {
      if (q && vals[i]) faixas.push({ quantidade_min: q, valor_total: vals[i] });
    });
  }
  return faixas;
}

module.exports = {
  FAIXA_PCT_OPCOES,
  parseImagensUrls,
  parseFaixas
};
