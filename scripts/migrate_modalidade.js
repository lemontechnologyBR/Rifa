const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$executeRawUnsafe("ALTER TABLE rifas ADD COLUMN modalidade TEXT NOT NULL DEFAULT 'cotas'")
  .then(() => { console.log('OK - coluna modalidade adicionada'); })
  .catch(e => { console.log('SKIP (provavelmente ja existe):', e.message); })
  .finally(() => p.$disconnect());
