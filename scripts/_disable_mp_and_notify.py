"""Desativa MP split no .env da VPS e dispara e-mails para organizadores vinculados."""
import os
import paramiko
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
COMPOSE_DIR = "/docker/vourifar"
ENV_FILE = "/docker/vourifar/.env"
CONTAINER = "vourifar-rifas-1"

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
    if err and err not in out:
        print("ERR:", err[:500])
    return out


# 1) Garante flag no .env
print("=== Atualizando .env (MERCADOPAGO_SPLIT_ENABLED=false) ===")
run(
    f"grep -q '^MERCADOPAGO_SPLIT_ENABLED=' {ENV_FILE} "
    f"&& sed -i 's/^MERCADOPAGO_SPLIT_ENABLED=.*/MERCADOPAGO_SPLIT_ENABLED=false/' {ENV_FILE} "
    f"|| echo 'MERCADOPAGO_SPLIT_ENABLED=false' >> {ENV_FILE}"
)
run(f"grep MERCADOPAGO_SPLIT_ENABLED {ENV_FILE}")

# 2) Recria container para pegar env + imagem nova
print("\n=== Recreate container ===")
run(f"cd {COMPOSE_DIR} && docker compose pull", timeout=180)
run(f"cd {COMPOSE_DIR} && docker compose up -d --force-recreate", timeout=120)
time.sleep(8)
run(f"docker exec {CONTAINER} wget -qO- http://127.0.0.1:3000/health || curl -sf http://127.0.0.1:3000/health")

# 3) Confirma flag dentro do app
print("\n=== Confirma flag no container ===")
run(f"docker exec {CONTAINER} printenv MERCADOPAGO_SPLIT_ENABLED")

# 4) Dispara e-mails
print("\n=== Enviando e-mails ===")
SCRIPT = r"""
const S = require('./services/avisoMpDesativadoService');
(async()=>{
  const r = await S.enviarParaTodos();
  console.log(JSON.stringify(r));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
"""
escaped = SCRIPT.replace("'", "'\\''")
run(f"docker exec -w /app {CONTAINER} node -e '{escaped}'", timeout=180)

c.close()
print("\nConcluido.")
