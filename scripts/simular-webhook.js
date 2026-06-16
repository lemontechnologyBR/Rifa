/**
 * Script para simular webhook de pagamento PIX.
 * Uso: node scripts/simular-webhook.js PIX-1234567890-ABC
 */

require('dotenv').config();

const codigo = process.argv[2];
if (!codigo) {
  console.error('Uso: node scripts/simular-webhook.js <codigo_pagamento>');
  process.exit(1);
}

const secret = process.env.WEBHOOK_SECRET || 'webhook-secreto-local';
const url = `http://localhost:${process.env.PORT || 3000}/api/pagamentos/webhook`;

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': secret
  },
  body: JSON.stringify({ codigo_pagamento: codigo })
})
  .then((r) => r.json())
  .then((data) => {
    console.log('Resposta:', data);
  })
  .catch((err) => {
    console.error('Erro:', err.message);
    console.log('Certifique-se de que o servidor está rodando (npm start).');
  });
