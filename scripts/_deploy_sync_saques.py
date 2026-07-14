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


print("Aguardando CI (~90s)...")
time.sleep(90)
run("cd /docker/vourifar && docker compose pull && docker compose up -d --force-recreate")
time.sleep(15)
run("docker logs --tail=10 vourifar-rifas-1 2>&1 | grep SyncSaque")
run("docker exec -w /app vourifar-rifas-1 node -e \"require('./jobs/syncSaques').sincronizar().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);})\"")
run(
    "docker exec -w /app vourifar-rifas-1 node -e "
    "\"require('./lib/prisma').saque.updateMany({where:{status:'processando'},data:{status:'concluido'}}).then(r=>{console.log('updated',r);process.exit(0);});\""
)
run(
    "docker exec -w /app vourifar-rifas-1 node -e "
    "\"require('./lib/prisma').saque.findMany({orderBy:{id:'desc'},take:3}).then(r=>console.log(JSON.stringify(r,null,2))).finally(()=>process.exit(0));\""
)
c.close()
