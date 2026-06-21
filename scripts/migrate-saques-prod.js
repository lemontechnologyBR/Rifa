/** Migration one-shot: tabela saques em produção */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS saques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      valor_bruto REAL NOT NULL,
      taxa REAL NOT NULL DEFAULT 0,
      valor_liquido REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'solicitado',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS idx_saques_tenant ON saques(tenant_id)'
  );
  console.log('Tabela saques OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
