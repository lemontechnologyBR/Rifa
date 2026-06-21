"""Aplica migration MP OAuth no container via Prisma."""
import paramiko

HOST = "2.24.109.239"
USER = "root"
PASS = "Lemon@Technology#2"
CONTAINER = "vourifar-rifas-1"

JS = r"""
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const stmts = [
  'ALTER TABLE tenants ADD COLUMN mp_user_id TEXT',
  'ALTER TABLE tenants ADD COLUMN mp_access_token TEXT',
  'ALTER TABLE tenants ADD COLUMN mp_refresh_token TEXT',
  'ALTER TABLE tenants ADD COLUMN mp_token_expires_at DATETIME',
  'ALTER TABLE tenants ADD COLUMN mp_nickname TEXT',
  'ALTER TABLE tenants ADD COLUMN mp_connected_at DATETIME',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_mp_user_id ON tenants(mp_user_id) WHERE mp_user_id IS NOT NULL'
];
(async () => {
  for (const s of stmts) {
    try {
      await prisma.$executeRawUnsafe(s);
      console.log('OK:', s.slice(0, 60));
    } catch (e) {
      if (/duplicate column|already exists/i.test(String(e.message))) {
        console.log('SKIP:', s.slice(0, 60));
      } else {
        throw e;
      }
    }
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

sftp = client.open_sftp()
remote = "/tmp/mp_oauth_migrate.js"
with sftp.open(remote, "w") as f:
    f.write(JS)
sftp.close()

_, stdout, stderr = client.exec_command(
    f"docker cp {remote} {CONTAINER}:/app/mp_oauth_migrate.js && "
    f"docker exec -w /app {CONTAINER} node mp_oauth_migrate.js",
    timeout=60,
)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print("STDERR:", err)
client.close()
