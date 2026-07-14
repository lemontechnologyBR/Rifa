const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const EMAIL = 'elivemmo2@gmail.com';
const ORG_WOOVI = 0.93;

function detectProvider(ref) {
  if (!ref) return 'woovi';
  return /^\d+$/.test(String(ref)) ? 'mercadopago' : 'woovi';
}

(async () => {
  const org = await p.organizador.findFirst({ where: { email: EMAIL }, include: { tenant: true } });
  if (!org) return;
  const rifaIds = (await p.rifa.findMany({ where: { tenantId: org.tenantId }, select: { id: true } })).map((r) => r.id);
  const reservas = await p.reserva.findMany({
    where: { rifaId: { in: rifaIds }, statusPagamento: 'confirmado' },
    select: { valorTotal: true, wooviCorrelationId: true }
  });
  let wooviBruto = 0;
  for (const r of reservas) {
    if (detectProvider(r.wooviCorrelationId) !== 'mercadopago') wooviBruto += Number(r.valorTotal || 0);
  }
  const wooviLiquido = wooviBruto * ORG_WOOVI;
  const sacado = await p.saque.aggregate({
    where: { tenantId: org.tenantId, status: { in: ['solicitado', 'processando', 'concluido'] } },
    _sum: { valorBruto: true }
  });
  const totalSacado = sacado._sum.valorBruto || 0;
  console.log('Tenant:', org.tenant.slug);
  console.log('Woovi bruto confirmado:', wooviBruto.toFixed(2));
  console.log('Liquido 93%:', wooviLiquido.toFixed(2));
  console.log('Total sacado DB:', totalSacado.toFixed(2));
  console.log('Saldo disponivel UI:', Math.max(0, wooviLiquido - totalSacado).toFixed(2));
  const saques = await p.saque.findMany({ where: { tenantId: org.tenantId }, orderBy: { createdAt: 'desc' } });
  console.log('Saques:', saques.length);
  await p.$disconnect();
})();
