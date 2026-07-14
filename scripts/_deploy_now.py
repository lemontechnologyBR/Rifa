import os
import paramiko
import time

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)


def run(cmd, timeout=300):
    print(f"\n$ {cmd}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out


print("Aguardando build CI (~90s)...")
time.sleep(90)

for attempt in range(1, 6):
    print(f"\n=== Deploy tentativa {attempt}/5 ===")
    run("cd /docker/vourifar && docker compose pull")
    out = run("cd /docker/vourifar && docker compose up -d --force-recreate")
    run("docker inspect vourifar-rifas-1 --format '{{.Image}}'")
    run("docker logs --tail=15 vourifar-rifas-1 2>&1")
    run("docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health 2>/dev/null || curl -sf http://127.0.0.1:3000/health")
    img = run("docker inspect vourifar-rifas-1 --format '{{.Image}}'")
    if img:
        break
    print("Aguardando imagem nova...")
    time.sleep(45)

c.close()
print("\nDeploy concluido.")
