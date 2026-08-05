/** Configurações centrais da plataforma VouRifar */

/** Taxa percentual retida em vendas via PIX (Woovi). */
const TAXA_PLATAFORMA_WOOVI = 0.05;

/** Percentual líquido do organizador por venda (antes da taxa fixa por cota). */
const ORGANIZADOR_PERCENTUAL_WOOVI = 1 - TAXA_PLATAFORMA_WOOVI;

/** Taxa fixa por cota vendida (descontada da parte do organizador). */
const TAXA_FIXA_COTA_WOOVI = 0.50;

/** Vigência da taxa fixa por cota — reservas anteriores não sofrem retroatividade. */
const TAXA_FIXA_COTA_WOOVI_DESDE = new Date('2026-07-14T14:31:00.000Z');

function taxaFixaCotaWooviPara(createdAt) {
  if (!createdAt) return TAXA_FIXA_COTA_WOOVI;
  return new Date(createdAt) >= TAXA_FIXA_COTA_WOOVI_DESDE ? TAXA_FIXA_COTA_WOOVI : 0;
}

/** Alias legado — mesmo valor da taxa Woovi. */
const TAXA_PLATAFORMA = TAXA_PLATAFORMA_WOOVI;
const ORGANIZADOR_PERCENTUAL = ORGANIZADOR_PERCENTUAL_WOOVI;

const MULTIPLICADOR_TAXA = 1.0;
const TAXA_SAQUE = 5.50;
const TAXA_SAQUE_GATEWAY = 0;
const SAQUE_MINIMO = 50;

module.exports = {
  TAXA_PLATAFORMA,
  TAXA_PLATAFORMA_WOOVI,
  MULTIPLICADOR_TAXA,
  ORGANIZADOR_PERCENTUAL,
  ORGANIZADOR_PERCENTUAL_WOOVI,
  TAXA_FIXA_COTA_WOOVI,
  TAXA_FIXA_COTA_WOOVI_DESDE,
  taxaFixaCotaWooviPara,
  TAXA_SAQUE,
  TAXA_SAQUE_GATEWAY,
  SAQUE_MINIMO
};
