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

def run(cmd, label):
    print(f"\n{'='*50}\n  {label}\n{'='*50}")
    _, o, e = c.exec_command(cmd, timeout=15)
    out = o.read().decode(errors="replace").strip()
    if out: print(out)
    err = e.read().decode(errors="replace").strip()
    if err and err not in out: print("[ERR]", err)

run("date", "DATA/HORA ATUAL DO HOST")
run("cat /etc/timezone 2>/dev/null || timedatectl | head -5", "TIMEZONE DO HOST")
run(f'docker exec {CONTAINER} date', "DATA/HORA DENTRO DO CONTAINER")
run(f'docker exec {CONTAINER} node -e "console.log(new Date().toString()); console.log(Intl.DateTimeFormat().resolvedOptions().timeZone);"', "NODE: new Date() no container")
run(f'docker exec {CONTAINER} env | grep -i tz', "TZ env var no container")

c.close()
