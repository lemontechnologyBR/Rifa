/**
 * Cálculo de valor com faixas (valor fixo ou % de desconto).
 */
function valorFaixaAplicado(faixa, quantidade, valorCota) {
  const qtd = Math.max(0, Number(quantidade) || 0);
  const valor = Number(valorCota) || 0;
  const pct = faixa.percentualDesconto != null ? Number(faixa.percentualDesconto) : null;
  if (pct != null && pct > 0) {
    return Math.max(0, qtd * valor * (1 - pct / 100));
  }
  const fixo = Number(faixa.valorTotal) || 0;
  return fixo > 0 ? fixo : qtd * valor;
}

function faixaTemDesconto(faixa) {
  const pct = faixa.percentualDesconto != null ? Number(faixa.percentualDesconto) : 0;
  if (pct > 0) return true;
  return (Number(faixa.valorTotal) || 0) > 0;
}

function calcularValorComFaixas(faixas, valorCota, quantidade, bonusCotas = 0) {
  const qtdCobrada = Math.max(0, Number(quantidade) - Number(bonusCotas || 0));
  if (qtdCobrada === 0) return 0;

  const faixasOrdenadas = [...(faixas || [])].sort((a, b) => b.quantidadeMin - a.quantidadeMin);
  for (const faixa of faixasOrdenadas) {
    if (qtdCobrada >= faixa.quantidadeMin && faixaTemDesconto(faixa)) {
      return valorFaixaAplicado(faixa, qtdCobrada, valorCota);
    }
  }
  return valorCota * qtdCobrada;
}

function labelFaixaDesconto(faixa, valorCota) {
  const pct = faixa.percentualDesconto != null ? Number(faixa.percentualDesconto) : null;
  if (pct != null && pct > 0) {
    const exemplo = valorFaixaAplicado(faixa, faixa.quantidadeMin, valorCota);
    return `${faixa.quantidadeMin}+ cotas · ${pct}% off · R$ ${exemplo.toFixed(2).replace('.', ',')}`;
  }
  const v = Number(faixa.valorTotal) || 0;
  return `${faixa.quantidadeMin}+ cotas · R$ ${v.toFixed(2).replace('.', ',')}`;
}

function detalheCompraPublic(faixas, valorCota, quantidade) {
  const valor = Number(valorCota) || 0;
  const qtd = Math.max(0, Number(quantidade) || 0);
  const cheio = qtd * valor;
  const subtotal = calcularValorComFaixas(faixas, valor, qtd);
  const economia = Math.max(0, cheio - subtotal);
  const sorted = [...(faixas || [])].sort((a, b) => b.quantidadeMin - a.quantidadeMin);
  let faixa = null;
  for (const f of sorted) {
    if (qtd >= f.quantidadeMin && faixaTemDesconto(f)) {
      faixa = f;
      break;
    }
  }
  let pct = null;
  if (faixa && faixa.percentualDesconto != null && Number(faixa.percentualDesconto) > 0) {
    pct = Number(faixa.percentualDesconto);
  } else if (economia > 0 && cheio > 0) {
    pct = Math.round((economia / cheio) * 100);
  }
  return { cheio, subtotal, economia, total: subtotal, pct, faixa };
}

module.exports = {
  valorFaixaAplicado,
  calcularValorComFaixas,
  labelFaixaDesconto,
  detalheCompraPublic
};
