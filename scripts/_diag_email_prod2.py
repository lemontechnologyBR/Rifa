import os
import paramiko

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)


def run(cmd):
    print(f"\n$ {cmd}")
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out:
        print(out)
    if err:
        print("ERR:", err)
    return out


run("grep '^SMTP_PASS=' /docker/vourifar/.env | wc -c")
run("docker logs vourifar-rifas-1 2>&1 | grep -i '\\[Email\\] Enviado' | tail -5")
run("docker logs vourifar-rifas-1 2>&1 | grep -i '\\[Email\\]' | tail -30")
run("docker inspect vourifar-rifas-1 --format '{{.State.StartedAt}}'")

# Test if production pass matches known value without printing it
run(
    "python3 -c \"import re; t=open('/docker/vourifar/.env').read(); "
    "m=re.search(r'^SMTP_PASS=(.*)$', t, re.M); "
    "v=m.group(1).strip().strip(chr(34)).strip(chr(39)) if m else ''; "
    "print('PASS_LEN', len(v)); "
    "print('MATCH_TEST_PASS', v=='Lemon@Tech#1')\""
)

c.close()
