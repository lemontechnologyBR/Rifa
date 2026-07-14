import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"

SCRIPT = r"""
const { PrismaClient } = require('@prisma/client');
const CarteiraService = require('./services/carteiraService');
const p = new PrismaClient();
(async () => {
  const org = await p.organizador.findFirst({ where: { email: 'elivemmo2@gmail.com' }, include: { tenant: true } });
  const t = org.tenant;
  const resumo = await CarteiraService.obterResumo(t.id, t);
  console.log(JSON.stringify({
    saldoDisponivel: resumo.saldoDisponivel,
    totalSacado: resumo.totalSacado,
    parteOrganizador: resumo.woovi.parteOrganizador,
    bruto: resumo.woovi.bruto,
    cotas: resumo.woovi.cotas,
    saldoConfirmado: resumo.saldoConfirmado
  }, null, 2));
  await p.$disconnect();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)
escaped = SCRIPT.replace("'", "'\\''")
cmd = f"docker exec -w /app {CONTAINER} node -e '{escaped}'"
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err.strip():
    print("ERR:", err[:2000])
c.close()
