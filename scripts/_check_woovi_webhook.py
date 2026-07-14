import os
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(os.environ["VOURIFAR_SSH_HOST"], username="root", password=os.environ["VOURIFAR_SSH_PASS"], timeout=20, look_for_keys=False, allow_agent=False)

cmds = [
    "grep -E '^APP_URL|^WOOVI' /docker/vourifar/.env | sed 's/\\(PASS=\\|APP_ID=\\).*/\\1***hidden***/'",
    "docker exec vourifar-rifas-1 wget -qO- --post-data='{\"event\":\"OPENPIX:MOVEMENT_CONFIRMED\",\"payment\":{\"correlationID\":\"diag-test\"}}' --header='Content-Type: application/json' http://127.0.0.1:3000/webhooks/woovi 2>/dev/null",
    "docker exec vourifar-rifas-1 node -e \"const f=fetch;const id=process.env.WOOVI_APP_ID;f('https://api.woovi.com/api/v1/webhook',{headers:{Authorization:id,Accept:'application/json'}}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.error(e.message));\"",
]
for cmd in cmds:
    print("===", cmd[:120])
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode(errors="replace").strip())
    err = e.read().decode(errors="replace").strip()
    if err:
        print("ERR:", err)
c.close()
