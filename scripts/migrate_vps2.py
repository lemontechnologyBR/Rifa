import paramiko

HOST = '2.24.109.239'
USER = 'root'
PASS = 'Lemon@Technology#2'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=15, look_for_keys=False, allow_agent=False)

# Copy script to container via docker cp
sftp = c.open_sftp()
sftp.put('scripts/migrate_modalidade.js', '/tmp/migrate_modalidade.js')
sftp.close()

_, stdout, stderr = c.exec_command('docker cp /tmp/migrate_modalidade.js vourifar-rifas-1:/app/migrate_modalidade.js && docker exec -w /app vourifar-rifas-1 node migrate_modalidade.js 2>&1')
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print('OUT:', out)
if err:
    print('ERR:', err)
c.close()
print('Concluido.')
