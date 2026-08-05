/**
 * Cálculo de valor com faixas (% ou valor fixo) — espelha lib/rifaPricing.js
 */
(function (root) {
  function pctFaixa(faixa) {
    if (faixa.percentualDesconto != null) return Number(faixa.percentualDesconto);
    if (faixa.percentual_desconto != null) return Number(faixa.percentual_desconto);
    return null;
  }

  function valorFaixaAplicado(faixa, quantidade, valorCota) {
    const qtd = Math.max(0, Number(quantidade) || 0);
    const valor = Number(valorCota) || 0;
    const pct = pctFaixa(faixa);
    if (pct != null && pct > 0) {
      return Math.max(0, qtd * valor * (1 - pct / 100));
    }
    const fixo = Number(faixa.valorTotal != null ? faixa.valorTotal : faixa.valor_total) || 0;
    return fixo > 0 ? fixo : qtd * valor;
  }

  function faixaTemDesconto(faixa) {
    const pct = pctFaixa(faixa);
    if (pct != null && pct > 0) return true;
    const fixo = Number(faixa.valorTotal != null ? faixa.valorTotal : faixa.valor_total) || 0;
    return fixo > 0;
  }

  function calcularSubtotalFaixas(faixas, valorCota, qtd) {
    if (!qtd) return 0;
    if (faixas && faixas.length) {
      const sorted = [...faixas].sort((a, b) => b.quantidadeMin - a.quantidadeMin);
      for (const f of sorted) {
        if (qtd >= f.quantidadeMin && faixaTemDesconto(f)) {
          return valorFaixaAplicado(f, qtd, valorCota);
        }
      }
    }
    return qtd * valorCota;
  }

  function faixaAplicada(faixas, qtd) {
    if (!faixas?.length) return null;
    const sorted = [...faixas].sort((a, b) => b.quantidadeMin - a.quantidadeMin);
    for (const f of sorted) {
      if (qtd >= f.quantidadeMin && faixaTemDesconto(f)) return f;
    }
    return null;
  }

  function proximaFaixa(faixas, qtd) {
    if (!faixas?.length) return null;
    const sorted = [...faixas].sort((a, b) => a.quantidadeMin - b.quantidadeMin);
    return sorted.find((f) => qtd < f.quantidadeMin && faixaTemDesconto(f)) || null;
  }

  function detalheCompra(faixas, valorCota, qtd) {
    const cheio = (Number(qtd) || 0) * (Number(valorCota) || 0);
    const subtotal = calcularSubtotalFaixas(faixas, valorCota, qtd);
    const economia = Math.max(0, cheio - subtotal);
    const faixa = faixaAplicada(faixas, qtd);
    const proxima = proximaFaixa(faixas, qtd);
    let pct = null;
    if (faixa && faixa.percentualDesconto != null && Number(faixa.percentualDesconto) > 0) {
      pct = Number(faixa.percentualDesconto);
    } else if (economia > 0 && cheio > 0) {
      pct = Math.round((economia / cheio) * 100);
    }
    return { cheio, subtotal, economia, faixa, pct, proxima };
  }

  function valorPacoteFaixa(faixa, valorCota) {
    const q = faixa.quantidadeMin;
    return valorFaixaAplicado(faixa, q, valorCota);
  }

  root.RifaPricing = {
    valorFaixaAplicado,
    calcularSubtotalFaixas,
    valorPacoteFaixa,
    faixaAplicada,
    proximaFaixa,
    detalheCompra
  };
})(typeof window !== 'undefined' ? window : globalThis);
