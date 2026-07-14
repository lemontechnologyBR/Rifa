"""Dispara campanha de e-mail para leads quentes em produção."""
import os
import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"

SCRIPT = r"""
const OnboardingEmailService = require('./services/onboardingEmailService');
(async()=>{
  const r = await OnboardingEmailService.enviarCampanhaLeadsQuentes();
  console.log(JSON.stringify(r));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20,
          look_for_keys=False, allow_agent=False)
escaped = SCRIPT.replace("'", "'\\''")
cmd = f"docker exec -w /app {CONTAINER} node -e '{escaped}'"
_, o, e = c.exec_command(cmd, timeout=120)
out = o.read().decode(errors="replace").strip()
err = e.read().decode(errors="replace").strip()
c.close()
if out:
    print(out)
if err and "ExperimentalWarning" not in err:
    print("[ERR]", err[:500])
