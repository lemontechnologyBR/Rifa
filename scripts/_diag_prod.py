import os
import paramiko, time, sys

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
        print(f"\n{'='*60}")
        print(f"  {label}")
        print('='*60)
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out:
        print(out)
    if err:
        # docker logs mistura stderr, só mostrar se diferente
        combined = out + err
        if err not in out:
            print("[STDERR]", err)
    return out

# 1. Status do container
run(f'docker ps --filter name={CONTAINER} --format "table {{{{.Names}}}}\\t{{{{.Status}}}}\\t{{{{.RunningFor}}}}"',
    "STATUS DO CONTAINER")

# 2. Uso de recursos
run(f'docker stats {CONTAINER} --no-stream --format "CPU: {{{{.CPUPerc}}}}  MEM: {{{{.MemUsage}}}}  NET: {{{{.NetIO}}}}"',
    "USO DE RECURSOS")

# 3. Logs completos (últimos 80 linhas)
run(f'docker logs --tail=80 {CONTAINER} 2>&1',
    "LOGS (últimas 80 linhas)")

# 4. Busca por erros/warnings nos logs
run(f'docker logs --tail=200 {CONTAINER} 2>&1 | grep -iE "(error|err:|warn|unhandled|exception|crash|fatal|ECONNREFUSED|prisma|smtp|nodemailer)" | tail -40',
    "ERROS/WARNINGS ENCONTRADOS NOS LOGS")

# 5. Health check
run(f'docker exec {CONTAINER} wget -qO- http://127.0.0.1:3000/health 2>/dev/null || echo "HEALTH FALHOU"',
    "HEALTH CHECK")

# 6. Variáveis de ambiente (sem senhas)
run(f'docker exec {CONTAINER} env | grep -vE "(PASSWORD|SECRET|PASS|TOKEN|KEY)" | sort',
    "VARIÁVEIS DE AMBIENTE (sem secrets)")

# 7. Disco no host
run('df -h / | tail -1', "DISCO NO HOST")

# 8. Memória no host
run('free -h', "MEMÓRIA NO HOST")

# 9. Processos Node dentro do container
run(f'docker exec {CONTAINER} ps aux | grep node',
    "PROCESSOS NODE NO CONTAINER")

c.close()
print("\n\n✅ Diagnóstico concluído.")
