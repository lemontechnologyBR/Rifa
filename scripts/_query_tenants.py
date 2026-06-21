import paramiko, sys

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('2.24.109.239', username='root', password='Lemon@Technology#2', timeout=15, look_for_keys=False, allow_agent=False)

js = 'const p=require("/app/lib/prisma");p.tenant.findMany({select:{id:true,slug:true,mpUserId:true,mpNickname:true,pixChave:true,mpAccessToken:true,mpRefreshToken:true,mpConnectedAt:true}}).then(r=>{r.forEach(t=>{if(t.mpAccessToken)t.mpAccessToken=t.mpAccessToken.slice(0,30)+"...";if(t.mpRefreshToken)t.mpRefreshToken="[HIDDEN]";});console.log(JSON.stringify(r,null,2));process.exit(0);}).catch(e=>{console.error(e.message);process.exit(1);});'

sftp = c.open_sftp()
with sftp.open('/tmp/q.js', 'w') as f:
    f.write(js)
sftp.close()

_, stdout, stderr = c.exec_command('docker cp /tmp/q.js vourifar-rifas-1:/tmp/q.js && docker exec vourifar-rifas-1 node /tmp/q.js')
out = stdout.read().decode(errors='replace')
err = stderr.read().decode(errors='replace')
print(out)
if err.strip():
    print("STDERR:", err[:500])
c.close()
