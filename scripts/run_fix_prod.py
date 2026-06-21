import paramiko

HOST = '2.24.109.239'
USER = 'root'
PASS = 'Lemon@Technology#2'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=15, look_for_keys=False, allow_agent=False)

sftp = c.open_sftp()
sftp.put('scripts/fix_modalidade_prod.js', '/tmp/fix_modalidade_prod.js')
sftp.close()

_, stdout, stderr = c.exec_command(
    'docker cp /tmp/fix_modalidade_prod.js vourifar-rifas-1:/app/fix_modalidade_prod.js && '
    'docker exec -w /app vourifar-rifas-1 node fix_modalidade_prod.js 2>&1'
)
print(stdout.read().decode().strip())
err = stderr.read().decode().strip()
if err:
    print('ERR:', err)
c.close()
