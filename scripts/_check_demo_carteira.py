"""Validate /demo carteira resumo after hotfix."""
import os
import json
import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]

JS = r"""
const { PrismaClient } = require('@prisma/client');
const CarteiraService = require('./services/carteiraService');
const prisma = new PrismaClient();
(async () => {
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: 'demo' }, { email: 'elivemmo2@gmail.com' }] }
  });
  if (!tenant) { console.log(JSON.stringify({ error: 'tenant not found' })); return; }
  const resumo = await CarteiraService.obterResumo(tenant.id);
  console.log(JSON.stringify({
    slug: tenant.slug,
    email: tenant.email,
    pixChave: tenant.pixChave,
    saldoDisponivel: resumo.saldoDisponivel,
    totalSacado: resumo.totalSacado,
    parteOrg: resumo.woovi?.parteOrganizador,
    bruto: resumo.woovi?.bruto,
    saldoSubconta: resumo.woovi?.saldoSubconta,
    saldoConfirmado: resumo.saldoConfirmado
  }, null, 2));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

sftp = c.open_sftp()
with sftp.file("/tmp/check_demo_carteira.js", "w") as f:
    f.write(JS)
sftp.close()

_, o, e = c.exec_command(
    "docker cp /tmp/check_demo_carteira.js vourifar-rifas-1:/app/_check_demo_carteira.js "
    "&& docker exec -w /app vourifar-rifas-1 node _check_demo_carteira.js",
    timeout=60,
)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err.strip():
    print("ERR:", err)
c.close()
