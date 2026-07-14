import os
import time
from pathlib import Path

import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
LOCAL = Path(__file__).resolve().parents[1] / "services" / "carteiraService.js"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)


def run(cmd, timeout=120):
    print(f"\n$ {cmd}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out


_, o, _ = c.exec_command(
    "docker exec vourifar-rifas-1 find /app -name carteiraService.js 2>/dev/null"
)
paths = [p for p in o.read().decode().strip().splitlines() if p]
print("paths:", paths)
if not paths:
    raise SystemExit("carteiraService.js not found in container")

sftp = c.open_sftp()
with sftp.file("/tmp/carteiraService.js", "w") as f:
    f.write(LOCAL.read_text(encoding="utf-8"))
sftp.close()

run(f"docker cp /tmp/carteiraService.js vourifar-rifas-1:{paths[0]}")
run("docker restart vourifar-rifas-1")
time.sleep(10)
run(
    "docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health "
    "2>/dev/null || docker exec vourifar-rifas-1 curl -sf http://127.0.0.1:3000/health"
)

c.close()
print("\nHotfix ok.")
