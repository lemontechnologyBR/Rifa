import paramiko

HOST = '2.24.109.239'
USER = 'root'
PASS = 'Lemon@Technology#2'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=15, look_for_keys=False, allow_agent=False)

node_script = "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.$executeRawUnsafe(\"ALTER TABLE rifas ADD COLUMN modalidade TEXT NOT NULL DEFAULT 'cotas'\").then(()=>{console.log('OK');}).catch(e=>{console.log('SKIP:',e.message);}).finally(()=>p.$disconnect());"
cmd = f"docker exec vourifar-rifas-1 node -e \"{node_script}\" 2>&1"

_, stdout, stderr = c.exec_command(cmd)
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print('OUT:', out)
if err:
    print('ERR:', err)
c.close()
print('Concluido.')
