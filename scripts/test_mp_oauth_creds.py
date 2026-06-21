"""Testa credenciais OAuth Mercado Pago na VPS."""
import paramiko

JS = r"""
const id = process.env.MERCADOPAGO_CLIENT_ID;
const secret = process.env.MERCADOPAGO_CLIENT_SECRET;
const redirect = process.env.MERCADOPAGO_CALLBACK_URL;
console.log('client_id:', id);
console.log('redirect:', redirect);
fetch('https://api.mercadopago.com/oauth/token', {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    client_id: id,
    client_secret: secret,
    grant_type: 'client_credentials'
  }).toString()
}).then(async (r) => {
  const t = await r.text();
  console.log('client_credentials status:', r.status);
  console.log(t.slice(0, 300));
}).catch((e) => console.error(e.message));
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("2.24.109.239", username="root", password="Lemon@Technology#2", timeout=20, look_for_keys=False, allow_agent=False)
sftp = c.open_sftp()
with sftp.open("/tmp/mp_test.js", "w") as f:
    f.write(JS)
sftp.close()
_, out, err = c.exec_command("docker cp /tmp/mp_test.js vourifar-rifas-1:/app/mp_test.js && docker exec -w /app vourifar-rifas-1 node mp_test.js", timeout=30)
print(out.read().decode())
print(err.read().decode())
c.close()
