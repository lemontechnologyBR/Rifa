// Atualiza rifas com totalNumeros <= 100 para modalidade 'numeros'
// Execute: node update_modalidade_rifa.js [rifaId]
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const rifaId = process.argv[2] ? parseInt(process.argv[2]) : null;

async function main() {
  if (rifaId) {
    const r = await p.rifa.update({
      where: { id: rifaId },
      data: { modalidade: 'numeros' }
    });
    console.log(`Rifa #${r.id} "${r.titulo}" -> modalidade: numeros`);
  } else {
    // Lista rifas com <= 100 numeros
    const rifas = await p.rifa.findMany({ where: { totalNumeros: { lte: 100 } } });
    console.log('Rifas com <= 100 números:');
    rifas.forEach(r => console.log(`  #${r.id} "${r.titulo}" totalNumeros:${r.totalNumeros} modalidade:${r.modalidade}`));
    console.log('\nPasse o ID como argumento para atualizar: node update_modalidade_rifa.js <id>');
  }
}

main().catch(console.error).finally(() => p.$disconnect());
