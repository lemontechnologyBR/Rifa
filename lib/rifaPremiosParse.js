/**
 * Parse de prêmios do formulário admin — 1, 2 ou 3 prêmios.
 */

function normalizePremioModo(raw) {
  const m = String(raw || 'unico').toLowerCase();
  if (m === 'duplo' || m === '2' || m === 'dois') return 'duplo';
  if (m === 'podio' || m === 'trio' || m === '3' || m === 'tres') return 'podio';
  return 'unico';
}

/** Inferir modo ao editar rifa já salva */
function premioModoFromCount(count) {
  if (count >= 3) return 'podio';
  if (count === 2) return 'duplo';
  return 'unico';
}

function parsePremiosFromBody(body) {
  const modo = normalizePremioModo(body.premio_modo);

  if (body.premio_1 != null || body.premio_modo) {
    if (modo === 'podio') {
      const titulos = [body.premio_1, body.premio_2, body.premio_3]
        .map((t) => String(t || '').trim());
      if (titulos.some((t) => !t)) {
        throw new Error('No modo 3 prêmios, informe o título do 1º, 2º e 3º lugar.');
      }
      return titulos.map((titulo, i) => ({
        titulo,
        descricao: '',
        ordem: i,
        principal: i === 0
      }));
    }

    if (modo === 'duplo') {
      const t1 = String(body.premio_1 || '').trim();
      const t2 = String(body.premio_2 || '').trim();
      if (!t1 || !t2) {
        throw new Error('No modo 2 prêmios, informe o título do 1º e 2º lugar.');
      }
      return [
        { titulo: t1, descricao: '', ordem: 0, principal: true },
        { titulo: t2, descricao: '', ordem: 1, principal: false }
      ];
    }

    const unico = String(body.premio_1 || body.premio_titulo || '').trim();
    if (!unico) return [];
    return [{ titulo: unico, descricao: '', ordem: 0, principal: true }];
  }

  const premios = [];
  if (body.premio_titulo) {
    const titulos = Array.isArray(body.premio_titulo) ? body.premio_titulo : [body.premio_titulo];
    const descs = Array.isArray(body.premio_descricao) ? body.premio_descricao : [body.premio_descricao || ''];
    titulos.forEach((t, i) => {
      const titulo = String(t || '').trim();
      if (titulo) premios.push({ titulo, descricao: descs[i] || '', ordem: i, principal: i === 0 });
    });
  }
  return premios;
}

module.exports = {
  normalizePremioModo,
  premioModoFromCount,
  parsePremiosFromBody
};
