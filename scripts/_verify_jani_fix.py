import os
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(os.environ["VOURIFAR_SSH_HOST"], username="root", password=os.environ["VOURIFAR_SSH_PASS"], timeout=20, look_for_keys=False, allow_agent=False)
SCRIPT = r"""
const WooviService = require('./services/wooviService');
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{
  const org = await p.organizador.findFirst({ where: { email: 'correiajani53@gmail.com' }, include: { tenant: true } });
  const r = await WooviService.criarCobranca(org.tenant, {
    correlationID: 'verify-jani-' + Date.now(),
    valorReais: 10,
    valorOrganizadorReais: 9.3,
    comentario: 'Verificacao pos-fix'
  });
  console.log('OK:', r?.correlationID || r?.brCode?.slice(0,40) || 'charge created');
  await p.$disconnect();
})().catch(e=>{console.error('FALHOU:', e.message);process.exit(1)});
"""
escaped = SCRIPT.replace("'", "'\\''")
_, o, e = c.exec_command(f"docker exec -w /app vourifar-rifas-1 node -e '{escaped}'", timeout=60)
print(o.read().decode(errors='replace'))
print(e.read().decode(errors='replace'))
c.close()
