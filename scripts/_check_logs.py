import paramiko, sys

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('2.24.109.239', username='root', password='Lemon@Technology#2', timeout=15, look_for_keys=False, allow_agent=False)

_, o, _ = c.exec_command('docker logs --tail=120 vourifar-rifas-1 2>&1')
data = o.read().decode(errors='replace')
# Filter for relevant lines
lines = data.split('\n')
relevant = []
for line in lines:
    low = line.lower()
    if any(k in low for k in ['numero', 'disponiv', 'reserva', 'compra', 'finali', 'claim', 'carrinho', 'confirmar', 'error', 'erro', 'mercadopago']):
        relevant.append(line)
print('\n'.join(relevant[-60:]))
c.close()
