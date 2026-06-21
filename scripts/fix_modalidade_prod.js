// Lista e atualiza rifas com <= 100 números para modalidade 'numeros'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const rifas = await p.rifa.findMany({
    where: { totalNumeros: { lte: 100 } },
    select: { id: true, titulo: true, totalNumeros: true, modalidade: true, status: true }
  });

  if (!rifas.length) {
    console.log('Nenhuma rifa com <= 100 numeros encontrada.');
    return;
  }

  console.log('Rifas encontradas:');
  rifas.forEach(r => console.log(`  #${r.id} "${r.titulo}" [${r.totalNumeros} nums] modalidade=${r.modalidade} status=${r.status}`));

  const ids = rifas.map(r => r.id);
  const result = await p.rifa.updateMany({
    where: { id: { in: ids }, modalidade: 'cotas' },
    data: { modalidade: 'numeros' }
  });

  console.log(`\nAtualizadas: ${result.count} rifa(s) -> modalidade: numeros`);
}

main().catch(console.error).finally(() => p.$disconnect());
