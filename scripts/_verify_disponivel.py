import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]

SCRIPT = r"""
const { PrismaClient } = require('@prisma/client');
const CarteiraService = require('./services/carteiraService');
const p = new PrismaClient();
(async () => {
  const org = await p.organizador.findFirst({ where: { email: 'elivemmo2@gmail.com' }, include: { tenant: true } });
  const t = org.tenant;
  const r = await CarteiraService.obterResumo(t.id, t);
  console.log(JSON.stringify({
    brutoDisponivel: r.woovi.brutoDisponivel,
    cotasDisponiveis: r.woovi.cotasDisponiveis,
    saldoDisponivel: r.saldoDisponivel
  }));
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)
escaped = SCRIPT.replace("'", "'\\''")
cmd = f"docker exec -w /app vourifar-rifas-1 node -e '{escaped}'"
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode(errors="replace"))
print(e.read().decode(errors="replace")[:1000])
c.close()
