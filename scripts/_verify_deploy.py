import os
import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(os.environ["VOURIFAR_SSH_HOST"], username="root", password=os.environ["VOURIFAR_SSH_PASS"], timeout=20, look_for_keys=False, allow_agent=False)
time.sleep(8)

for cmd in [
    "docker logs --tail=20 vourifar-rifas-1 2>&1",
    "docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health 2>/dev/null || curl -sf http://127.0.0.1:3000/health",
    'docker ps --filter name=vourifar-rifas-1 --format "{{.Status}}"',
]:
    print("===", cmd)
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode(errors="replace").strip())
    err = e.read().decode(errors="replace").strip()
    if err:
        print("ERR:", err)
c.close()
