const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const EMAIL = process.argv[2] || 'emersoncaminhando@gmail.com';
const ORG_WOOVI = 0.93;
const ORG_MP = 0.95;

function detectProvider(ref) {
  if (!ref) return 'sem_ref';
  return /^\d+$/.test(String(ref)) ? 'mercadopago' : 'woovi';
}

function normalizarChave(chave) {
  if (!chave) return chave;
  const raw = String(chave).trim();
  if (raw.startsWith('+')) return raw;
  if (raw.includes('@') || raw.includes('-')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return raw;
}

(async () => {
  const org = await p.organizador.findFirst({
    where: { email: EMAIL },
    include: { tenant: true }
  });
  if (!org) {
    console.log('Organizador NAO encontrado');
    return;
  }

  const t = org.tenant;
  console.log('=== ORGANIZADOR ===');
  console.log('Nome:', org.nome, '| Email:', org.email);
  console.log('=== TENANT ===');
  console.log('ID:', t.id, '| Slug:', t.slug, '| Nome:', t.nome);
  console.log('PIX:', t.pixChave || 'NENHUMA');
  console.log('MP User:', t.mpUserId || 'NAO');
  console.log('Woovi ativo:', t.wooviAtivo);

  const rifas = await p.rifa.findMany({
    where: { tenantId: t.id },
    select: { id: true, titulo: true, status: true, valorCota: true }
  });
  console.log('\n=== RIFAS ===', rifas.length);
  rifas.forEach((r) => console.log(`  #${r.id} ${r.titulo} | ${r.status} | R$${r.valorCota}`));

  const rifaIds = rifas.map((r) => r.id);
  if (!rifaIds.length) {
    await p.$disconnect();
    return;
  }

  const reservas = await p.reserva.findMany({
    where: { rifaId: { in: rifaIds } },
    select: {
      id: true,
      statusPagamento: true,
      valorTotal: true,
      wooviCorrelationId: true,
      createdAt: true,
      _count: { select: { reservaNumeros: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const grupos = { woovi: { qtd: 0, cotas: 0, conf: 0 }, mp: { qtd: 0, cotas: 0, conf: 0 }, sem: { qtd: 0, cotas: 0, conf: 0 } };

  console.log('\n=== RESERVAS ===');
  for (const r of reservas) {
    const gw = detectProvider(r.wooviCorrelationId);
    const key = gw === 'mercadopago' ? 'mp' : gw === 'sem_ref' ? 'sem' : 'woovi';
    const v = Number(r.valorTotal || 0);
    const c = r._count.reservaNumeros;
    grupos[key].qtd++;
    grupos[key].cotas += c;
    if (r.statusPagamento === 'confirmado') grupos[key].conf += v;
    console.log(`#${r.id} | ${r.statusPagamento} | ${gw} | ${c}c | R$${v.toFixed(2)} | ref=${r.wooviCorrelationId || '-'}`);
  }

  console.log('\n=== RESUMO CONFIRMADO ===');
  console.log('Woovi:', `R$ ${grupos.woovi.conf.toFixed(2)}`, `(${grupos.woovi.cotas} cotas)`);
  console.log('MP:', `R$ ${grupos.mp.conf.toFixed(2)}`, `(${grupos.mp.cotas} cotas)`);
  console.log('Sem ref:', `R$ ${grupos.sem.conf.toFixed(2)}`);

  const wooviLiquido = grupos.woovi.conf * ORG_WOOVI;
  const mpLiquido = grupos.mp.conf * ORG_MP;

  const sacado = await p.saque.aggregate({
    where: { tenantId: t.id, status: { in: ['solicitado', 'processando', 'concluido'] } },
    _sum: { valorBruto: true, valorLiquido: true, taxa: true }
  });
  const saques = await p.saque.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'desc' } });

  const totalSacado = sacado._sum.valorBruto || 0;
  const saldoContabil = Math.max(0, wooviLiquido - totalSacado);

  console.log('\n=== CARTEIRA (contábil) ===');
  console.log('Woovi liquido 93%:', wooviLiquido.toFixed(2));
  console.log('MP liquido 95%:', mpLiquido.toFixed(2));
  console.log('Total sacado (bruto):', totalSacado.toFixed(2));
  console.log('Saldo disponivel contabil:', saldoContabil.toFixed(2));

  if (saques.length) {
    console.log('\n=== SAQUES ===');
    saques.forEach((s) => {
      console.log(`#${s.id} ${s.status} | bruto R$${Number(s.valorBruto).toFixed(2)} | liq R$${Number(s.valorLiquido).toFixed(2)} | taxa R$${Number(s.taxa||0).toFixed(2)}`);
      if (s.erroMsg) console.log('  erro:', s.erroMsg);
    });
  }

  if (t.pixChave && process.env.WOOVI_APP_ID) {
    const WOOVI_API = process.env.WOOVI_API_BASE || 'https://api.woovi.com/api/v1';
    const pix = encodeURIComponent(normalizarChave(t.pixChave));
    try {
      const res = await fetch(`${WOOVI_API}/subaccount/${pix}`, {
        headers: { Authorization: process.env.WOOVI_APP_ID, Accept: 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        const bal = Number(data?.subAccount?.balance ?? data?.balance ?? 0) / 100;
        console.log('\n=== SUBCONTA WOOVI ===');
        console.log('Chave:', data?.subAccount?.pixKey || t.pixChave);
        console.log('Saldo real:', `R$ ${bal.toFixed(2)}`);
        console.log('Saldo efetivo UI:', Math.min(saldoContabil, bal).toFixed(2));
      } else {
        console.log('\n=== SUBCONTA WOOVI ===');
        console.log('Erro:', JSON.stringify(data));
      }
    } catch (e) {
      console.log('Woovi fetch error:', e.message);
    }
  }

  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
