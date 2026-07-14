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
    if out: print(out)
    if err and "ExperimentalWarning" not in err: print("[ERR]", err[:500])

for name in ["_check_marlucy_saques.js", "_fix_subconta_woovi.js"]:
    sftp = c.open_sftp()
    sftp.put(fr"C:\Users\LEMON TECHNOLOGY\Documents\Rifa\scripts\{name}", f"/tmp/{name}")
    sftp.close()
    run(f"docker cp /tmp/{name} {CONTAINER}:/app/{name}")

run(f"docker exec -w /app {CONTAINER} node /app/_check_marlucy_saques.js", "SAQUES MARLUCY")
run(f'docker exec -w /app {CONTAINER} node /app/_fix_subconta_woovi.js "19989067050" "Ajude a Cafe"', "SALDO SUBCONTA WOOVI")

c.close()
