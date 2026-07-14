const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const PCT_ORG_WOOVI = 0.93;

(async () => {
  const tenants = await p.tenant.findMany({
    where: { mpAccessToken: { not: null }, status: 'ativo' },
    select: { id: true, nome: true, slug: true }
  });

  const resultados = [];

  for (const t of tenants) {
    const rifas = await p.rifa.findMany({ where: { tenantId: t.id }, select: { id: true } });
    const rifaIds = rifas.map(r => r.id);
    if (!rifaIds.length) continue;

    const wooviVendas = await p.reserva.findMany({
      where: {
        rifaId: { in: rifaIds },
        statusPagamento: 'confirmado',
        wooviCorrelationId: { not: null }
      },
      select: { valorTotal: true }
    });
    if (!wooviVendas.length) continue;

    const gmvWoovi = wooviVendas.reduce((s, r) => s + Number(r.valorTotal || 0), 0);
    const saldoOrg = gmvWoovi * PCT_ORG_WOOVI;

    const saques = await p.saque.aggregate({
      where: { tenantId: t.id, status: { in: ['solicitado', 'processando', 'concluido'] } },
      _sum: { valorBruto: true }
    });
    const totalSacado = saques._sum.valorBruto || 0;
    const saldoLivre = saldoOrg - totalSacado;

    if (saldoLivre > 0.01) {
      resultados.push({ ...t, gmvWoovi, saldoOrg, totalSacado, saldoLivre });
    }
  }

  if (!resultados.length) {
    console.log('Nenhum tenant com saldo Woovi preso e MP conectado.');
  } else {
    console.log('TENANTS COM SALDO PRESO:\n');
    resultados.forEach(r => {
      console.log(`[${r.nome}] /${r.slug}`);
      console.log(`  GMV Woovi: R$${r.gmvWoovi.toFixed(2)} | Org(93%): R$${r.saldoOrg.toFixed(2)} | Sacado: R$${r.totalSacado.toFixed(2)} | PRESO: R$${r.saldoLivre.toFixed(2)}`);
    });
  }

  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
