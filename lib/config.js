/** Configurações centrais da plataforma VouRifar */

/**
 * Taxa cobrada do ORGANIZADOR sobre o valor arrecadado.
 * O comprador paga o valor exato da cota — sem acréscimos.
 * A plataforma retém 5% do arrecadado; organizador recebe 95%.
 * Break-even Woovi (R$0,50 mín): cota de R$10,00.
 * Mínimo de compra configurado em R$10,50 para garantir margem positiva.
 */
const TAXA_PLATAFORMA = 0.05; // 5% retido da plataforma sobre o arrecadado

/** Percentual líquido que o organizador recebe por cota vendida */
const ORGANIZADOR_PERCENTUAL = 1 - TAXA_PLATAFORMA; // 0.95

/** Multiplicador do valor cobrado ao comprador: 1.0 (sem acréscimo) */
const MULTIPLICADOR_TAXA = 1.0;

module.exports = { TAXA_PLATAFORMA, MULTIPLICADOR_TAXA, ORGANIZADOR_PERCENTUAL };
