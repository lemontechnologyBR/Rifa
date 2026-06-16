/**
 * Funções utilitárias compartilhadas.
 */

const crypto = require('crypto');

/** Gera código único de indicação (8 caracteres) */
function gerarCodigoIndicacao() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/** Gera código de pagamento PIX único */
function gerarCodigoPagamento() {
  return `PIX-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Gera token de recuperação de senha */
function gerarTokenRecuperacao() {
  return crypto.randomBytes(32).toString('hex');
}

/** Limpa telefone — apenas dígitos */
function limparTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/** Limpa CPF — apenas dígitos */
function limparCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

/** Valida CPF brasileiro (11 dígitos + dígitos verificadores) */
function cpfValido(cpf) {
  const n = limparCpf(cpf);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(n.charAt(i), 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(n.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(n.charAt(i), 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === parseInt(n.charAt(10), 10);
}

/** Formata valor em BRL */
function formatarMoeda(valor) {
  return Number(valor).toFixed(2).replace('.', ',');
}

/** Monta payload PIX copia-e-cola simplificado (EMV) para QR Code */
function gerarPayloadPix(chavePix, valor, nomeBeneficiario, cidade, txId) {
  const montarCampo = (id, valorCampo) => {
    const len = String(valorCampo).length.toString().padStart(2, '0');
    return `${id}${len}${valorCampo}`;
  };

  const valorStr = Number(valor).toFixed(2);
  const merchantAccount = montarCampo('00', 'BR.GOV.BCB.PIX') + montarCampo('01', chavePix);
  const merchantAccountInfo = montarCampo('26', merchantAccount);
  const additionalData = montarCampo('05', txId.substring(0, 25));

  const payload =
    montarCampo('00', '01') +
    montarCampo('01', '11') +
    merchantAccountInfo +
    montarCampo('52', '0000') +
    montarCampo('53', '986') +
    montarCampo('54', valorStr) +
    montarCampo('58', 'BR') +
    montarCampo('59', (nomeBeneficiario || 'Rifas Online').substring(0, 25)) +
    montarCampo('60', (cidade || 'SAO PAULO').substring(0, 15)) +
    montarCampo('62', additionalData);

  const crc = calcularCRC16(payload + '6304');
  return payload + '6304' + crc;
}

/** CRC16-CCITT para payload PIX */
function calcularCRC16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/** Simula envio de e-mail no console */
function simularEnvioEmail(para, assunto, corpo) {
  console.log('\n📧 ===== E-MAIL SIMULADO =====');
  console.log(`Para: ${para}`);
  console.log(`Assunto: ${assunto}`);
  console.log('---');
  console.log(corpo);
  console.log('=============================\n');
}

module.exports = {
  gerarCodigoIndicacao,
  gerarCodigoPagamento,
  gerarTokenRecuperacao,
  limparTelefone,
  limparCpf,
  cpfValido,
  formatarMoeda,
  gerarPayloadPix,
  simularEnvioEmail
};
