/**
 * Utilitários de sorteio — embaralhamento criptograficamente seguro.
 */

const crypto = require('crypto');

/** Fisher-Yates shuffle (cópia; não altera o array original). */
function embaralharLista(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Até qtdPremios itens distintos do pool (embaralha e fatia). */
function sortearPremiosDistinctos(numerosVendidos, qtdPremios) {
  const embaralhados = embaralharLista(numerosVendidos);
  const qtd = Math.min(qtdPremios, embaralhados.length);
  return embaralhados.slice(0, qtd);
}

module.exports = { embaralharLista, sortearPremiosDistinctos };
