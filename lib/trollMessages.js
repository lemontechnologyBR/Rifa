/**
 * Mensagens provocativas para scanners / pentest / bots.
 * Só em respostas de rejeição — nunca em fluxo legítimo.
 */

const WEBHOOK_FAIL = [
  'Nice try, script kiddie. Assinatura inválida — a rifa não é roleta russa.',
  'Webhook forjado? Fofo. Volta pro TryHackMe e estuda RSA.',
  '401: sua payload entrou, sua dignidade não.',
  'Sem x-webhook-signature? Sem PIX confirmado. Sem desculpa.',
  'Detectamos um pentester em potencial. Spoiler: o buraco já foi fechado.',
  'CHARGE_COMPLETED fake não cola mais. Obrigado pelo QA gratuito.',
  'Você achou o endpoint. A gente achou seu IP. Placar: VouRifar 1 x 0.',
  'Essa rota exige assinatura da Woovi, não fé e curl.'
];

const HONEYPOT = [
  'Bot detectado. Conta não criada. Vai caçar bug em CTF, não aqui.',
  'Honeypot comeu seu cadastro. Bom apetite.',
  'Campo website preenchido = script. Humano de verdade deixa em branco.'
];

const SYNC_DENY = [
  'Sincronizar PIX sem login? Criativo. Negado.',
  'Essa API é de organizador autenticado, não de wanderlust com Burp.'
];

const XSS_REJECT = [
  'XSS? Em 2026? Fofo. Payload engolida, conta não criada.',
  'script/alert/onerror não passa. Estuda Content Security Policy.',
  'Tentou injetar HTML no nome da loja. Placar: sanitizer 1 x 0 script kiddie.',
  '</script> detectado. Sua carreira em bug bounty agradece o fail.',
  'document.domain não é prêmio de rifa. Tenta de novo sem tag HTML.',
  'Stored XSS bloqueado. Obrigado pelo pentest gratuito — patch já aplicado.',
  'onerror=alert()? Criativo. Negado. Volta pro PortSwigger Academy.',
  'Sua payload XSS virou souvenir no log. Conta? Zero. Ego? Também.',
  'HTML no nome da loja não é feature. É ticket pro firewall rir de você.'
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
  webhookFail(motivo) {
    return {
      ok: false,
      erro: 'Assinatura inválida.',
      motivo: motivo || undefined,
      troll: pick(WEBHOOK_FAIL),
      dica: 'Assine com a chave privada da Woovi. Ou vai vender coxinha.'
    };
  },
  honeypotMsg: () => pick(HONEYPOT),
  syncDeny: () => pick(SYNC_DENY),
  xssReject: () => pick(XSS_REJECT)
};
