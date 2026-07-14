/**
 * Envia todos os templates de e-mail para teste.
 * Uso: node scripts/_test_emails.js
 */
require('dotenv').config();

// Credenciais SMTP vêm do .env (dotenv.config() acima) — defina
// SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS localmente antes de rodar este script.
process.env.APP_URL = process.env.APP_URL || 'https://vourifar.com.br';

const { enviarEmail } = require('../lib/emailService');
const {
  templateReservaCriada,
  templatePagamentoConfirmado,
  templateReservaExpirada,
  templateVencedor,
  templateRecuperacaoSenha,
  templateBoasVindas
} = require('../lib/emailTemplates');

const DEST = 'elivemmo2@gmail.com';

const usuario   = { nome: 'Lucas Nunes Barbosa', email: DEST };
const rifa      = { titulo: 'Rifa do iPhone 15 Pro', dataSorteio: new Date('2026-07-10') };
const reserva   = { id: 42, valorTotal: 25.00, numeros: [5, 17, 33, 78, 99], expiraEm: new Date(Date.now() + 10 * 60 * 1000) };
const tenant    = { slug: 'demo' };
const organizador = { nome: 'João da Silva', email: DEST };

const testes = [
  {
    nome: '1 — Reserva criada (PIX pendente)',
    assunto: '[TESTE] Pague sua reserva na rifa "iPhone 15 Pro" 🎟️',
    html: templateReservaCriada({
      usuario,
      rifa,
      reserva,
      copiaCola: '00020126580014BR.GOV.BCB.PIX0136example-pix-key-for-test-only52040000530398654071000.005802BR5913VouRifar Demo6009Sao Paulo62290525PIX-1719000000-ABCDEF6304XXXX',
      qrCodeUrl: 'https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=PIX_TESTE',
      expiraEm: reserva.expiraEm,
      tenantSlug: tenant.slug
    }),
    texto: 'Teste de e-mail: reserva criada com PIX pendente.'
  },
  {
    nome: '2 — Pagamento confirmado',
    assunto: '[TESTE] Pagamento confirmado — Rifa "iPhone 15 Pro" ✓',
    html: templatePagamentoConfirmado({
      usuario,
      rifa,
      reserva,
      tenantSlug: tenant.slug
    }),
    texto: 'Teste de e-mail: pagamento confirmado.'
  },
  {
    nome: '3 — Reserva expirada',
    assunto: '[TESTE] Sua reserva na rifa "iPhone 15 Pro" expirou ⏱️',
    html: templateReservaExpirada({
      usuario,
      rifa,
      reserva,
      tenantSlug: tenant.slug
    }),
    texto: 'Teste de e-mail: reserva expirada.'
  },
  {
    nome: '4 — Vencedor do sorteio',
    assunto: '[TESTE] Parabéns! Você ganhou a rifa "iPhone 15 Pro" 🏆',
    html: templateVencedor({
      usuario,
      rifa,
      numeroSorteado: 33,
      premio: 'iPhone 15 Pro 256GB + AirPods Pro',
      tenantSlug: tenant.slug
    }),
    texto: 'Teste de e-mail: vencedor do sorteio.'
  },
  {
    nome: '5 — Recuperação de senha',
    assunto: '[TESTE] Redefinição de senha — VouRifar 🔐',
    html: templateRecuperacaoSenha({
      organizador,
      token: 'token-de-teste-abc123xyz456',
      tenantSlug: tenant.slug
    }),
    texto: 'Teste de e-mail: recuperação de senha.'
  },
  {
    nome: '6 — Boas-vindas organizador',
    assunto: '[TESTE] Bem-vindo à VouRifar! 🎉',
    html: templateBoasVindas({
      organizador,
      tenantSlug: tenant.slug
    }),
    texto: 'Teste de e-mail: boas-vindas.'
  }
];

(async () => {
  console.log(`\nEnviando ${testes.length} e-mails de teste para ${DEST}...\n`);
  for (const t of testes) {
    process.stdout.write(`  ${t.nome} ... `);
    await enviarEmail({ para: DEST, assunto: t.assunto, html: t.html, texto: t.texto });
    console.log('OK');
    await new Promise(r => setTimeout(r, 800));
  }
  console.log('\nConcluído! Verifique a caixa de entrada.\n');
})();
