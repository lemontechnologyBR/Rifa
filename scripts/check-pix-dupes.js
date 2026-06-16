require('dotenv').config();
const prisma = require('../lib/prisma');
const { chavesPixEquivalentes, normalizarChavePix } = require('../lib/pixKey');

(async () => {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, nome: true, pixChave: true }
  });

  console.log('Tenants com PIX:');
  tenants.filter((t) => t.pixChave).forEach((t) => {
    console.log(`  #${t.id} /${t.slug} "${t.nome}" → ${t.pixChave} (norm: ${normalizarChavePix(t.pixChave)})`);
  });

  const comPix = tenants.filter((t) => t.pixChave);
  for (let i = 0; i < comPix.length; i++) {
    for (let j = i + 1; j < comPix.length; j++) {
      if (chavesPixEquivalentes(comPix[i].pixChave, comPix[j].pixChave)) {
        console.log('DUPLICADO:', comPix[i].slug, '<->', comPix[j].slug);
      }
    }
  }

  const CarteiraService = require('../services/carteiraService');
  const alvo = comPix.find((t) => String(t.pixChave).includes('02929917628'));
  if (alvo) {
    const outro = comPix.find((t) => t.id !== alvo.id && chavesPixEquivalentes(t.pixChave, alvo.pixChave));
    if (outro) {
      try {
        await CarteiraService.assertPixChaveDisponivel(alvo.id, alvo.pixChave);
        console.log('BUG: assertPixChaveDisponivel NAO bloqueou');
      } catch (e) {
        console.log('assertPixChaveDisponivel bloqueou OK:', e.message);
      }
    }
  }

  await prisma.$disconnect();
})();
