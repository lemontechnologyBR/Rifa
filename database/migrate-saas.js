/**
 * Migra dados existentes para tenant demo (executar uma vez após schema SaaS).
 * npm run migrate:saas
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');

async function main() {
  console.log('Migrando para SaaS multi-tenant...\n');

  let tenant = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: 'demo',
        nome: 'VouRifar Demo',
        corPrimaria: '#6366f1'
      }
    });
    console.log('Tenant demo criado');
  }

  const semTenant = await prisma.rifa.count({ where: { NOT: { tenantId: tenant.id } } });
  if (semTenant > 0) {
    await prisma.rifa.updateMany({
      where: { NOT: { tenantId: tenant.id } },
      data: { tenantId: tenant.id }
    });
    console.log('Rifas associadas ao tenant demo');
  }

  const org = await prisma.organizador.findFirst({ where: { tenantId: tenant.id } });
  if (!org) {
    await prisma.organizador.create({
      data: {
        tenantId: tenant.id,
        nome: 'Organizador Demo',
        email: 'demo@sortefacil.local',
        senhaHash: bcrypt.hashSync('demo123', 10)
      }
    });
    console.log('Organizador demo: demo@sortefacil.local / demo123');
  }

  console.log('\nMigração concluída. Acesse: /demo');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
