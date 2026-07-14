import os
import paramiko, sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(os.environ['VOURIFAR_SSH_HOST'], username='root', password=os.environ['VOURIFAR_SSH_PASS'], timeout=20, look_for_keys=False, allow_agent=False)
SCRIPT = r'''
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{
  const agora = new Date();
  const d30 = new Date(agora - 30*864e5);
  const d7 = new Date(agora - 7*864e5);
  const conf = await p.reserva.findMany({
    where: { statusPagamento: 'confirmado' },
    select: { valorTotal: true, createdAt: true, wooviCorrelationId: true }
  });
  const sum = (arr) => arr.reduce((s,r)=>s+Number(r.valorTotal||0),0);
  const last30 = conf.filter(r=>new Date(r.createdAt)>=d30);
  const last7 = conf.filter(r=>new Date(r.createdAt)>=d7);
  const tenants = await p.tenant.count({ where: { status: 'ativo' } });
  const comPix = await p.tenant.count({ where: { status:'ativo', pixChave: { not: null } } });
  const comMp = await p.tenant.count({ where: { status:'ativo', mpAccessToken: { not: null } } });
  const orgs = await p.organizador.count();
  console.log(JSON.stringify({
    orgs,
    tenantsAtivos: tenants,
    comPix,
    comMp,
    totalConfirmado: conf.length,
    gmvTotal: Math.round(sum(conf)*100)/100,
    gmv30d: Math.round(sum(last30)*100)/100,
    count30d: last30.length,
    gmv7d: Math.round(sum(last7)*100)/100,
    count7d: last7.length,
    projMensal: Math.round(sum(last7)/7*30*100)/100
  }, null, 2));
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
'''
escaped = SCRIPT.replace("'", "'\\''")
_, o, e = c.exec_command(f"docker exec -w /app vourifar-rifas-1 node -e '{escaped}'", timeout=60)
print(o.read().decode(errors='replace'))
print(e.read().decode(errors='replace')[:300])
c.close()
