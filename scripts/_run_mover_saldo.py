import os
import paramiko
import sys

HOST = os.environ["VOURIFAR_SSH_HOST"]
USER = "root"
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"
EMAIL = "elivemmo2@gmail.com"
EXECUTE = "--execute" in sys.argv

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=20,
          look_for_keys=False, allow_agent=False)

def run(cmd, label=None):
    if label:
        print(f"\n{'='*60}\n  {label}\n{'='*60}")
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out:
        print(out)
    if err and "ExperimentalWarning" not in err:
        print("[ERR]", err[:500])
    return out

sftp = c.open_sftp()
sftp.put(r"C:\Users\LEMON TECHNOLOGY\Documents\Rifa\scripts\_mover_saldo_principal.js",
         "/tmp/_mover_saldo_principal.js")
sftp.close()

run(f"docker cp /tmp/_mover_saldo_principal.js {CONTAINER}:/app/_mover_saldo_principal.js")

flag = " --execute" if EXECUTE else ""
run(f'docker exec -w /app {CONTAINER} node /app/_mover_saldo_principal.js "{EMAIL}"{flag}',
    f"MOVER SALDO → PRINCIPAL ({EMAIL})")

c.close()
