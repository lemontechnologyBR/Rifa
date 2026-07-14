import os
import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
USER = "root"
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"

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

sftp = c.open_sftp()
sftp.put(r"C:\Users\LEMON TECHNOLOGY\Documents\Rifa\scripts\_check_marlucy_vendas.js",
         "/tmp/_check_marlucy_vendas.js")
sftp.close()

run(f"docker cp /tmp/_check_marlucy_vendas.js {CONTAINER}:/app/_check_marlucy_vendas.js")
run(f"docker exec -w /app {CONTAINER} node /app/_check_marlucy_vendas.js",
    "VENDAS MARLUCY POR GATEWAY")

c.close()
