const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const EMAIL = 'marlucyfuregatibrito@gmail.com';
const ORG_WOOVI = 0.93;
const ORG_MP = 0.95;

function detectProvider(ref) {
  if (!ref) return 'sem_ref';
  return /^\d+$/.test(String(ref)) ? 'mercadopago' : 'woovi';
}

(async () => {
  const org = await p.organizador.findFirst({
    where: { email: EMAIL },
    include: { tenant: true }
  });
  if (!org) { console.log('Não encontrado'); return; }

  const rifaIds = (await p.rifa.findMany({
    where: { tenantId: org.tenantId },
    select: { id: true }
  })).map((r) => r.id);

  const [confirmadas, saques] = await Promise.all([
    p.reserva.findMany({
      where: { rifaId: { in: rifaIds }, statusPagamento: 'confirmado' },
      select: { valorTotal: true, wooviCorrelationId: true, _count: { select: { reservaNumeros: true } } }
    }),
    p.saque.findMany({
      where: { tenantId: org.tenantId },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  let wooviBruto = 0, wooviCotas = 0, mpBruto = 0, mpCotas = 0;
  for (const r of confirmadas) {
    const v = Number(r.valorTotal || 0);
    const c = r._count.reservaNumeros;
    if (detectProvider(r.wooviCorrelationId) === 'mercadopago') {
      mpBruto += v; mpCotas += c;
    } else {
      wooviBruto += v; wooviCotas += c;
    }
  }

  const wooviLiquido = wooviBruto * ORG_WOOVI;
  const mpLiquido = mpBruto * ORG_MP;

  let sacadoBruto = 0, sacadoLiquido = 0, sacadoTaxa = 0;
  for (const s of saques) {
    if (!['solicitado', 'processando', 'concluido'].includes(s.status)) continue;
    sacadoBruto += Number(s.valorBruto || 0);
    sacadoLiquido += Number(s.valorLiquido || 0);
    sacadoTaxa += Number(s.taxa || 0);
  }

  const saldoPlatDisponivel = Math.max(0, wooviLiquido - sacadoBruto);

  console.log('=== MARLUCY — VALORES LÍQUIDOS ===\n');
  console.log('WOOVI (plataforma):');
  console.log(`  Bruto confirmado: R$ ${wooviBruto.toFixed(2)} (${wooviCotas} cotas)`);
  console.log(`  Líquido organizador (93%): R$ ${wooviLiquido.toFixed(2)}`);
  console.log(`  Já sacado (bruto): R$ ${sacadoBruto.toFixed(2)}`);
  console.log(`  Taxas de saque pagas: R$ ${sacadoTaxa.toFixed(2)}`);
  console.log(`  Recebido em saques (líquido): R$ ${sacadoLiquido.toFixed(2)}`);
  console.log(`  Saldo plataforma disponível p/ saque: R$ ${saldoPlatDisponivel.toFixed(2)}`);

  console.log('\nMERCADO PAGO:');
  console.log(`  Bruto confirmado: R$ ${mpBruto.toFixed(2)} (${mpCotas} cotas, 2 vendas)`);
  console.log(`  Líquido na conta MP (95%): R$ ${mpLiquido.toFixed(2)}`);
  console.log('  (já creditado direto — sem saque manual)');

  console.log('\nTOTAL LÍQUIDO ORGANIZADOR:');
  console.log(`  Woovi já recebido em saques: R$ ${sacadoLiquido.toFixed(2)}`);
  console.log(`  Woovi ainda na plataforma: R$ ${saldoPlatDisponivel.toFixed(2)}`);
  console.log(`  Mercado Pago (na conta): R$ ${mpLiquido.toFixed(2)}`);
  console.log(`  SOMA: R$ ${(sacadoLiquido + saldoPlatDisponivel + mpLiquido).toFixed(2)}`);

  if (saques.length) {
    console.log('\n--- Saques ---');
    saques.forEach((s) => {
      console.log(`#${s.id} ${s.status} | bruto R$ ${Number(s.valorBruto).toFixed(2)} | taxa R$ ${Number(s.taxa||0).toFixed(2)} | líquido R$ ${Number(s.valorLiquido).toFixed(2)}`);
    });
  }

  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
