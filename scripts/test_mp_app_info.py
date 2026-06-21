"""Consulta app MP na VPS."""
import paramiko

JS = r"""
const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
const id = process.env.MERCADOPAGO_CLIENT_ID;
(async () => {
  const paths = [
    '/users/me',
    '/applications/' + id
  ];
  for (const path of paths) {
    const r = await fetch('https://api.mercadopago.com' + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
    });
    const t = await r.text();
    console.log('---', path, r.status, '---');
    console.log(t.slice(0, 1200));
  }
})();
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("2.24.109.239", username="root", password="Lemon@Technology#2", timeout=20, look_for_keys=False, allow_agent=False)
sftp = c.open_sftp()
with sftp.open("/tmp/mp_app.js", "w") as f:
    f.write(JS)
sftp.close()
_, out, err = c.exec_command(
    "docker cp /tmp/mp_app.js vourifar-rifas-1:/app/mp_app.js && docker exec -w /app vourifar-rifas-1 node mp_app.js",
    timeout=30,
)
print(out.read().decode())
if err.read().decode().strip():
    print("ERR:", err.read().decode())
c.close()
