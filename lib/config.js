/** Configurações centrais da plataforma VouRifar */

// ── Modalidade Mercado Pago (organizer recebe direto via OAuth split) ──────────
/**
 * Taxa total retida no split MP: organizador recebe 95%.
 * O comprador paga o valor exato da cota — sem acréscimos.
 */
const TAXA_PLATAFORMA = 0.05; // 5% total retido

/**
 * Taxa de processamento PIX cobrada pelo Mercado Pago (~1%).
 * No modelo split, essa taxa é debitada pelo MP da parte do vendedor.
 * Para garantir que o organizador receba exatamente 95%, o application_fee
 * deve ser reduzido em TAXA_MP_PIX (plataforma absorve o custo MP).
 */
const TAXA_MP_PIX = 0.01; // 1% cobrado pelo MP sobre o valor da transação

/**
 * application_fee enviado ao MP no split OAuth.
 * = TAXA_PLATAFORMA - TAXA_MP_PIX
 * Assim: organizer = valor - application_fee - mp_fee = 95%
 * Exemplo R$ 10: organizer=9,50 | platform=0,40 | MP=0,10
 */
const TAXA_APPLICATION_FEE = TAXA_PLATAFORMA - TAXA_MP_PIX; // 0.04 (4%)

/** Percentual líquido que o organizador recebe por cota vendida (modalidade MP) */
const ORGANIZADOR_PERCENTUAL = 1 - TAXA_PLATAFORMA; // 0.95

// ── Modalidade Plataforma (Woovi — plataforma coleta, organizer saca) ─────────
/**
 * Taxa total retida quando o pagamento é processado pela plataforma (Woovi).
 * O organizador recebe o restante via saque manual com chave PIX.
 */
const TAXA_PLATAFORMA_WOOVI = 0.07; // 7% total retido

/** Percentual líquido que o organizador recebe por cota vendida (modalidade Plataforma) */
const ORGANIZADOR_PERCENTUAL_WOOVI = 1 - TAXA_PLATAFORMA_WOOVI; // 0.93

// ── Geral ────────────────────────────────────────────────────────────────────
/** Multiplicador do valor cobrado ao comprador: 1.0 (sem acréscimo) */
const MULTIPLICADOR_TAXA = 1.0;

/** Saque — saldo disponível abaixo deste valor cobra taxa fixa */
const SAQUE_GRATIS_MIN = 500;

/** Taxa de saque quando saldo disponível < SAQUE_GRATIS_MIN (debitada antes do PIX Out) */
const TAXA_SAQUE = 5.50;

/** Custo estimado PIX Out / transferência (referência para margem de saque) */
const TAXA_SAQUE_GATEWAY = 0;

/** Saldo mínimo (95%) para permitir saque */
const SAQUE_MINIMO = 50;

module.exports = {
  TAXA_PLATAFORMA,
  TAXA_MP_PIX,
  TAXA_APPLICATION_FEE,
  TAXA_PLATAFORMA_WOOVI,
  MULTIPLICADOR_TAXA,
  ORGANIZADOR_PERCENTUAL,
  ORGANIZADOR_PERCENTUAL_WOOVI,
  SAQUE_GRATIS_MIN,
  TAXA_SAQUE,
  TAXA_SAQUE_GATEWAY,
  SAQUE_MINIMO
};
