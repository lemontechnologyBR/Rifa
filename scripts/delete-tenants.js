require('dotenv').config();
const prisma = require('../lib/prisma');

const SLUGS = ['jogao-da-sorte', 'rifadaju'];

(async () => {
  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: SLUGS } },
    select: {
      id: true,
      slug: true,
      nome: true,
      pixChave: true,
      _count: { select: { organizadores: true, rifas: true, logs: true } }
    }
  });

  if (!tenants.length) {
    console.log('Nenhum dos cadastros encontrado:', SLUGS.join(', '));
    await prisma.$disconnect();
    return;
  }

  console.log('Cadastros a apagar:');
  tenants.forEach((t) => {
    console.log(`  #${t.id} /${t.slug} "${t.nome}" — org: ${t._count.organizadores}, rifas: ${t._count.rifas}`);
  });

  for (const t of tenants) {
    await prisma.tenant.delete({ where: { id: t.id } });
    console.log(`Apagado: /${t.slug}`);
  }

  const restantes = await prisma.tenant.findMany({
    select: { id: true, slug: true, nome: true },
    orderBy: { id: 'asc' }
  });
  console.log('\nTenants restantes:');
  restantes.forEach((t) => console.log(`  #${t.id} /${t.slug} "${t.nome}"`));

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
