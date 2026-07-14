"""Hotfix: taxa 5% + R$0,50 por cota vendida (PIX plataforma / Woovi)."""
import os
import time
from pathlib import Path

import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "lib/config.js",
    "services/carteiraService.js",
    "services/reservaService.js",
    "lib/emailTemplates.js",
    "lib/seoMeta.js",
    "controllers/organizadorController.js",
    "views/admin/carteira.ejs",
    "views/admin/partials/rifa-simulacao.ejs",
    "views/admin/partials/nova-rifa-modal.ejs",
    "views/admin/partials/recebimento-carteira-info.ejs",
    "views/admin/rifas.ejs",
    "views/partials/footer.ejs",
    "views/platform/landing.ejs",
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)


def run(cmd, timeout=60):
    print(f"\n$ {cmd}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out


sftp = c.open_sftp()
try:
    sftp.mkdir("/tmp/hotfix_taxa_cota")
except IOError:
    pass

for rel in FILES:
    local_path = ROOT / rel
    tmp_name = rel.replace("/", "__")
    remote_tmp = f"/tmp/hotfix_taxa_cota/{tmp_name}"
    with sftp.file(remote_tmp, "w") as f:
        f.write(local_path.read_text(encoding="utf-8"))
    run(f"docker cp {remote_tmp} vourifar-rifas-1:/app/{rel}")

sftp.close()

run("docker restart vourifar-rifas-1")
time.sleep(10)
run(
    "docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health "
    "2>/dev/null || docker exec vourifar-rifas-1 curl -sf http://127.0.0.1:3000/health"
)

c.close()
print("\nHotfix taxa 5% + R$0,50/cota aplicado.")
