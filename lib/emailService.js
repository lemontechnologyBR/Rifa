/**
 * Serviço de envio de e-mails via SMTP Hostinger.
 * Usa nodemailer; cai em log de console quando SMTP não está configurado.
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  _transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_PORT || '465') !== '587',
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  return _transporter;
}

/**
 * Envia um e-mail HTML.
 * Falha silenciosamente em dev (apenas loga no console).
 */
async function enviarEmail({ para, assunto, html, texto }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n📧 [EMAIL SIMULADO] Para: ${para} | Assunto: ${assunto}`);
    if (texto) console.log(texto.slice(0, 300));
    return;
  }

  const from = `"VouRifar" <${process.env.SMTP_USER}>`;

  try {
    const info = await transporter.sendMail({
      from,
      to: para,
      subject: assunto,
      html,
      text: texto || ''
    });
    console.log(`[Email] Enviado para ${para} — messageId: ${info.messageId}`);
  } catch (err) {
    console.error(`[Email] Falha ao enviar para ${para}:`, err.message);
  }
}

module.exports = { enviarEmail };
