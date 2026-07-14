"""Hotfix generico: envia lista de arquivos alterados para o container."""
import os
import time
from pathlib import Path

import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ("lib/config.js", "/app/lib/config.js"),
    ("services/saqueService.js", "/app/services/saqueService.js"),
    ("views/admin/carteira.ejs", "/app/views/admin/carteira.ejs"),
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

sftp = c.open_sftp()
for local_rel, remote in FILES:
    local = ROOT / local_rel
    tmp = f"/tmp/{Path(local_rel).name}_{abs(hash(local_rel))}"
    with sftp.file(tmp, "w") as f:
        f.write(local.read_text(encoding="utf-8"))
    print(f"upload {local_rel} -> {remote}")
    _, o, e = c.exec_command(f"docker cp {tmp} vourifar-rifas-1:{remote}", timeout=30)
    print(o.read().decode(errors="replace"), e.read().decode(errors="replace"))
sftp.close()

_, o, e = c.exec_command("docker restart vourifar-rifas-1", timeout=60)
print(o.read().decode(errors="replace"), e.read().decode(errors="replace"))
time.sleep(8)
_, o, _ = c.exec_command(
    "docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health 2>/dev/null "
    "|| docker exec vourifar-rifas-1 curl -sf http://127.0.0.1:3000/health",
    timeout=30,
)
print(o.read().decode(errors="replace"))
c.close()
print("ok")
