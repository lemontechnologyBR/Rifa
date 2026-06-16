/** Configurações centrais da plataforma VouRifar */

/** Taxa cobrada do comprador (sobre o valor da cota do organizador). */
const TAXA_PLATAFORMA = 0.10; // 10%

/** Multiplicador para o valor total cobrado: 1 + taxa */
const MULTIPLICADOR_TAXA = 1 + TAXA_PLATAFORMA;

module.exports = { TAXA_PLATAFORMA, MULTIPLICADOR_TAXA };
