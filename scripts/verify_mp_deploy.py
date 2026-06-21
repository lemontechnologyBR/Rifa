import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("2.24.109.239", username="root", password="Lemon@Technology#2", timeout=20, look_for_keys=False, allow_agent=False)

_, out, _ = c.exec_command("grep MERCADOPAGO /docker/vourifar/.env | cut -d= -f1")
keys = [k.strip() for k in out.read().decode().splitlines() if k.strip()]
print("Env keys:", ", ".join(keys))

_, out, _ = c.exec_command("docker exec vourifar-rifas-1 wget -qO- http://127.0.0.1:3000/health")
print("Health:", out.read().decode().strip())

_, out, err = c.exec_command(
    "docker exec -w /app vourifar-rifas-1 node -e \""
    "const s=require('./services/mercadoPagoOAuthService');"
    "console.log('splitConfigured:', s.isSplitConfigured());\""
)
print(out.read().decode() + err.read().decode())
c.close()
