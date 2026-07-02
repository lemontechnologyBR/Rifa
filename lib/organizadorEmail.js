/**
 * Envia e-mail para todos os organizadores de um tenant.
 */

const prisma = require('./prisma');
const { enviarEmail } = require('./emailService');

async function notificarOrganizadores(tenantId, { assunto, html, texto }) {
  const orgs = await prisma.organizador.findMany({
    where: { tenantId: Number(tenantId) },
    select: { email: true }
  });

  for (const org of orgs) {
    if (!org.email) continue;
    await enviarEmail({ para: org.email, assunto, html, texto });
  }
}

module.exports = { notificarOrganizadores };
