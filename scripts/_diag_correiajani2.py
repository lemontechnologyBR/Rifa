import os
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

def run(cmd, t=120):
    _, o, e = c.exec_command(cmd, timeout=t)
    return o.read().decode(errors='replace') + e.read().decode(errors='replace')

SCRIPT = r"""
const WooviService = require('./services/wooviService');
const {PrismaClient} = require('@prisma/client');
const { detectarTipoChavePix } = require('./lib/pixKey');
const p = new PrismaClient();
(async()=>{
  const org = await p.organizador.findFirst({ where: { email: 'correiajani53@gmail.com' }, include: { tenant: true } });
  const pix = org.tenant.pixChave;
  const tipo = detectarTipoChavePix(pix);
  const digits = String(pix).replace(/\D/g,'');
  const wrongPhone = '+55' + digits;
  console.log('PIX:', pix, '| tipo:', tipo);
  console.log('Woovi key atual (bug):', wrongPhone);
  console.log('Woovi key correta CPF:', digits);

  for (const [label, key] of [['WRONG_PHONE', wrongPhone], ['CPF', digits]]) {
    try {
      const d = await WooviService._request('/subaccount/' + encodeURIComponent(key));
      console.log(label, 'subconta:', JSON.stringify(d?.subAccount || d));
    } catch(e) { console.log(label, 'subconta ERRO:', e.message.slice(0,300)); }
  }

  try {
    await WooviService.ensureSubconta(org.tenant);
    console.log('ensureSubconta: ok (com bug)');
  } catch(e) { console.log('ensureSubconta FALHOU:', e.message.slice(0,400)); }

  try {
    const r = await WooviService.criarCobranca(org.tenant, {
      correlationID: 'diag-jani-' + Date.now(),
      valorReais: 10,
      valorOrganizadorReais: 9.3,
      comentario: 'Teste diag'
    });
    console.log('cobranca OK id:', r?.correlationID || JSON.stringify(r).slice(0,200));
  } catch(e) { console.log('cobranca FALHOU:', e.message.slice(0,500)); }

  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
"""

escaped = SCRIPT.replace("'", "'\\''")
print(run(f"docker exec -w /app {CONTAINER} node -e '{escaped}'"))

print('--- LOGS ---')
print(run(f"docker logs --tail=300 {CONTAINER} 2>&1 | grep -iE 'tratamento-sandra|05817434660|correiajani|tenant.*46|Woovi.*46|subconta' | tail -30"))

print('--- SCAN CPF AS PHONE ---')
SCAN = r"""
const {PrismaClient} = require('@prisma/client');
const { detectarTipoChavePix } = require('./lib/pixKey');
const WooviService = require('./services/wooviService');
const p = new PrismaClient();
(async()=>{
  const orgs = await p.organizador.findMany({
    where: { tenant: { pixChave: { not: null }, mpAccessToken: null, status: 'ativo' } },
    include: { tenant: { select: { slug: true, pixChave: true } } }
  });
  const cpfOrgs = orgs.filter(o => detectarTipoChavePix(o.tenant.pixChave) === 'cpf');
  const affected = [];
  for (const o of cpfOrgs) {
    const cpf = String(o.tenant.pixChave).replace(/\D/g,'');
    const wrong = '+55' + cpf;
    let cpfOk = false, wrongOk = false;
    try { await WooviService._request('/subaccount/' + encodeURIComponent(cpf)); cpfOk = true; } catch(_){}
    try { await WooviService._request('/subaccount/' + encodeURIComponent(wrong)); wrongOk = true; } catch(_){}
    if (!cpfOk && !wrongOk) affected.push({ email: o.email, slug: o.tenant.slug, pix: o.tenant.pixChave, status: 'sem_subconta' });
    else if (wrongOk && !cpfOk) affected.push({ email: o.email, slug: o.tenant.slug, pix: o.tenant.pixChave, status: 'subconta_telefone_errado' });
    else if (cpfOk) affected.push({ email: o.email, slug: o.tenant.slug, pix: o.tenant.pixChave, status: 'subconta_cpf_ok' });
  }
  console.log(JSON.stringify({ totalCpf: cpfOrgs.length, affected }, null, 2));
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
"""
escaped2 = SCAN.replace("'", "'\\''")
print(run(f"docker exec -w /app {CONTAINER} node -e '{escaped2}'", t=300))
c.close()
