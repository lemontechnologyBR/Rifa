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
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out.strip())
    if err.strip():
        print("ERR:", err.strip())
    return out

print("=== SMTP env (keys only + host) ===")
run("grep -E '^SMTP_|^APP_URL' /docker/vourifar/.env | sed 's/\\(PASS=\\).*/\\1***hidden***/'")

print("\n=== SMTP inside container ===")
run("docker exec vourifar-rifas-1 printenv | grep SMTP | sed 's/SMTP_PASS=.*/SMTP_PASS=***hidden***/'")

print("\n=== Email logs (last 200 lines) ===")
run("docker logs --tail=400 vourifar-rifas-1 2>&1 | grep -iE '\\[Email\\]|EMAIL SIMULADO|smtp|nodemailer|Falha ao enviar' | tail -40")

print("\n=== Recent errors ===")
run("docker logs --tail=200 vourifar-rifas-1 2>&1 | grep -iE 'error|fail|email' | tail -25")

print("\n=== Test SMTP from container ===")
test_js = r"""
const nodemailer = require('nodemailer');
const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const port = Number(process.env.SMTP_PORT) || 465;
if (!host || !user || !pass) {
  console.log('MISSING_SMTP', { host: !!host, user: !!user, pass: !!pass });
  process.exit(2);
}
const t = nodemailer.createTransport({
  host, port,
  secure: port !== 587,
  auth: { user, pass },
  tls: { rejectUnauthorized: false }
});
t.verify().then(() => console.log('SMTP_VERIFY_OK')).catch(e => {
  console.log('SMTP_VERIFY_FAIL', e.message);
  process.exit(1);
});
"""
run(f"docker exec vourifar-rifas-1 node -e \"{test_js.replace(chr(10), ' ')}\"")

c.close()
