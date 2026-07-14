const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const EMAIL = 'marlucyfuregatibrito@gmail.com';

(async () => {
  const org = await p.organizador.findFirst({
    where: { email: EMAIL },
    include: { tenant: true }
  });
  if (!org) { console.log('Não encontrado'); return; }

  const saques = await p.saque.findMany({
    where: { tenantId: org.tenantId },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Tenant: ${org.tenant.nome} | PIX: ${org.tenant.pixChave}`);
  console.log(`\n--- Saques (${saques.length}) ---`);
  if (!saques.length) {
    console.log('Nenhum saque registrado.');
  } else {
    saques.forEach((s) => {
      console.log(JSON.stringify({
        id: s.id,
        status: s.status,
        valorBruto: s.valorBruto,
        taxa: s.taxa,
        valorLiquido: s.valorLiquido,
        wooviCorrelationId: s.wooviCorrelationId,
        erroMsg: s.erroMsg,
        createdAt: s.createdAt
      }, null, 2));
      console.log('---');
    });
  }

  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
