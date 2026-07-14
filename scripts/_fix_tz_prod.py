import os
import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
USER = "root"
PASS = os.environ["VOURIFAR_SSH_PASS"]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=20,
          look_for_keys=False, allow_agent=False)

def run(cmd, label=None):
    if label: print(f"\n>>> {label}")
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out: print(out)
    if err and err not in out: print("[ERR]", err)
    return out

# Envia o docker-compose.yml correto via SFTP
sftp = c.open_sftp()
sftp.put(r"C:\Users\LEMON TECHNOLOGY\Documents\Rifa\docker-compose.yml", "/docker/vourifar/docker-compose.yml")
sftp.close()
print("docker-compose.yml enviado via SFTP")

run("cat /docker/vourifar/docker-compose.yml | grep -A2 'environment'", "Verificando environment no compose")
run("cd /docker/vourifar && docker compose config --quiet && echo 'compose valido'", "Validando compose")
run("cd /docker/vourifar && docker compose up -d --force-recreate", "Reiniciando container")

import time; time.sleep(8)
run("docker exec vourifar-rifas-1 node -e \"console.log('TZ:', process.env.TZ); console.log(new Date().toLocaleString('pt-BR'));\"", "Verificacao final")
run("docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health 2>/dev/null", "Health check")
c.close()
print("\n✅ Pronto.")
