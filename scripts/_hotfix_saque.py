"""Hotfix saqueService.js — saldo from DB only."""
import os
import time
from pathlib import Path

import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
LOCAL = Path(__file__).resolve().parents[1] / "services" / "saqueService.js"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

sftp = c.open_sftp()
with sftp.file("/tmp/saqueService.js", "w") as f:
    f.write(LOCAL.read_text(encoding="utf-8"))
sftp.close()

_, o, e = c.exec_command(
    "docker cp /tmp/saqueService.js vourifar-rifas-1:/app/services/saqueService.js "
    "&& docker restart vourifar-rifas-1",
    timeout=60,
)
print(o.read().decode(errors="replace"))
print(e.read().decode(errors="replace"))
time.sleep(8)
_, o, _ = c.exec_command(
    "docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health 2>/dev/null "
    "|| docker exec vourifar-rifas-1 curl -sf http://127.0.0.1:3000/health",
    timeout=30,
)
print(o.read().decode(errors="replace"))
c.close()
print("ok")
