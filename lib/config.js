/** Configurações centrais da plataforma VouRifar */

/**
 * Taxa cobrada do ORGANIZADOR sobre o valor arrecadado.
 * O comprador paga o valor exato da cota — sem acréscimos.
 * A plataforma retém 10% do arrecadado; organizador recebe 90%.
 */
const TAXA_PLATAFORMA = 0.10; // 10% retido da plataforma sobre o arrecadado

/** Percentual líquido que o organizador recebe por cota vendida */
const ORGANIZADOR_PERCENTUAL = 1 - TAXA_PLATAFORMA; // 0.90

/** Multiplicador do valor cobrado ao comprador: 1.0 (sem acréscimo) */
const MULTIPLICADOR_TAXA = 1.0;

module.exports = { TAXA_PLATAFORMA, MULTIPLICADOR_TAXA, ORGANIZADOR_PERCENTUAL };
