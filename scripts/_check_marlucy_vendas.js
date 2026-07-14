const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const EMAIL = 'marlucyfuregatibrito@gmail.com';

function detectProvider(ref) {
  if (!ref) return 'sem_ref';
  return /^\d+$/.test(String(ref)) ? 'mercadopago' : 'woovi';
}

(async () => {
  const org = await p.organizador.findFirst({
    where: { email: EMAIL },
    include: { tenant: true }
  });
  if (!org) {
    console.log('Organizador não encontrado');
    return;
  }

  const t = org.tenant;
  console.log(`Tenant: ${t.nome} (${t.slug})`);
  console.log(`PIX: ${t.pixChave || '—'} | MP conectado: ${t.mpUserId ? 'sim' : 'não'}`);

  const rifaIds = (await p.rifa.findMany({
    where: { tenantId: t.id },
    select: { id: true, titulo: true }
  })).map((r) => r.id);

  const reservas = await p.reserva.findMany({
    where: { rifaId: { in: rifaIds } },
    select: {
      id: true,
      statusPagamento: true,
      valorTotal: true,
      wooviCorrelationId: true,
      createdAt: true,
      reservaNumeros: { select: { numero: { select: { numero: true } } } }
    },
    orderBy: { createdAt: 'asc' }
  });

  const grupos = {
    woovi: { qtd: 0, cotas: 0, total: 0, confirmadas: 0 },
    mercadopago: { qtd: 0, cotas: 0, total: 0, confirmadas: 0 },
    sem_ref: { qtd: 0, cotas: 0, total: 0, confirmadas: 0 }
  };

  console.log('\n--- Vendas por reserva ---');
  for (const r of reservas) {
    const gw = detectProvider(r.wooviCorrelationId);
    const cotas = r.reservaNumeros.length;
    const v = Number(r.valorTotal || 0);
    grupos[gw].qtd++;
    grupos[gw].cotas += cotas;
    grupos[gw].total += v;
    if (r.statusPagamento === 'confirmado') grupos[gw].confirmadas += v;

    if (r.statusPagamento === 'confirmado') {
      console.log(
        `#${r.id} | ${gw.toUpperCase()} | ${cotas} cota(s) | R$ ${v.toFixed(2)} | ${new Date(r.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      );
    }
  }

  console.log('\n--- Vendas Mercado Pago (todas) ---');
  const mpReservas = reservas.filter((r) => detectProvider(r.wooviCorrelationId) === 'mercadopago');
  if (!mpReservas.length) {
    console.log('Nenhuma venda MP encontrada.');
  } else {
    mpReservas.forEach((r) => {
      const cotas = r.reservaNumeros.length;
      const v = Number(r.valorTotal || 0);
      console.log(
        `#${r.id} | ${r.statusPagamento} | ${cotas} cota(s) | R$ ${v.toFixed(2)} | ref=${r.wooviCorrelationId || '—'} | ${new Date(r.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      );
    });
    const mpConf = mpReservas.filter((r) => r.statusPagamento === 'confirmado');
    console.log(`\nTotal MP: ${mpReservas.length} reserva(s), ${mpConf.length} confirmada(s), ${mpConf.reduce((s, r) => s + r.reservaNumeros.length, 0)} cota(s) confirmadas`);
  }

  console.log('\n--- Resumo confirmadas ---');
  for (const [gw, g] of Object.entries(grupos)) {
    if (!g.qtd) continue;
    console.log(
      `${gw}: ${g.qtd} reserva(s), ${g.cotas} cota(s), R$ ${g.confirmadas.toFixed(2)} confirmado (bruto total R$ ${g.total.toFixed(2)})`
    );
  }

  const wooviOrg = grupos.woovi.confirmadas * 0.93;
  const mpOrg = grupos.mercadopago.confirmadas * 0.95;
  console.log('\n--- Parte estimada do organizador ---');
  console.log(`Woovi (93%): R$ ${wooviOrg.toFixed(2)}`);
  console.log(`Mercado Pago (95%): R$ ${mpOrg.toFixed(2)}`);
  console.log(`Total estimado: R$ ${(wooviOrg + mpOrg).toFixed(2)}`);

  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
