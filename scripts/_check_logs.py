import os
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(os.environ['VOURIFAR_SSH_HOST'], username='root', password=os.environ['VOURIFAR_SSH_PASS'],
          timeout=15, look_for_keys=False, allow_agent=False)
_, o, _ = c.exec_command('docker logs --tail=80 vourifar-rifas-1 2>&1', timeout=30)
print(o.read().decode(errors='replace'))
c.close()
