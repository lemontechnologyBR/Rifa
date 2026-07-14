import os
import paramiko
import json

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"
EMAIL = "correiajani53@gmail.com"

def run_node(script):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASS, timeout=20,
              look_for_keys=False, allow_agent=False)
    escaped = script.replace("'", "'\\''")
    cmd = f"docker exec -w /app {CONTAINER} node -e '{escaped}'"
    _, o, e = c.exec_command(cmd, timeout=180)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    c.close()
    if err and "ExperimentalWarning" not in err and err not in out:
        print("[ERR]", err[:800])
    return out

print("=" * 60)
print("ORGANIZADOR + RIFAS + RESERVAS")
print("=" * 60)
print(run_node(f"""
const {{PrismaClient}} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{{
  const org = await p.organizador.findFirst({{
    where: {{ email: '{EMAIL}' }},
    include: {{ tenant: true }}
  }});
  if (!org) {{ console.log('NAO ENCONTRADO'); return; }}
  const rifas = await p.rifa.findMany({{ where: {{ tenantId: org.tenantId }} }});
  const rifaIds = rifas.map(r=>r.id);
  const reservas = rifaIds.length ? await p.reserva.findMany({{
    where: {{ rifaId: {{ in: rifaIds }} }},
    orderBy: {{ createdAt: 'desc' }},
    take: 10,
    include: {{ rifa: {{ select: {{ titulo: true }} }} }}
  }}) : [];
  const {{ detectarTipoChavePix }} = require('./lib/pixKey');
  console.log(JSON.stringify({{
    org: {{ id: org.id, nome: org.nome, email: org.email, createdAt: org.createdAt }},
    tenant: {{
      id: org.tenant.id, slug: org.tenant.slug, nome: org.tenant.nome,
      pixChave: org.tenant.pixChave, pixTipo: detectarTipoChavePix(org.tenant.pixChave),
      wooviAtivo: org.tenant.wooviAtivo, mpAccessToken: !!org.tenant.mpAccessToken
    }},
    rifas: rifas.map(r=>({{ id:r.id, titulo:r.titulo, status:r.status, valorCota:r.valorCota }})),
    reservas: reservas.map(r=>({{
      id:r.id, status:r.statusPagamento, valor:r.valorTotal,
      wooviId:r.wooviCorrelationId, rifa:r.rifa.titulo, em:r.createdAt
    }}))
  }}, null, 2));
  await p.$disconnect();
}})().catch(e=>{{console.error(e.message);process.exit(1)}});
"""))

print("\n" + "=" * 60)
print("WOOVI - CPF vs TELEFONE NORMALIZACAO")
print("=" * 60)
print(run_node(f"""
const WooviService = require('./services/wooviService');
const {{PrismaClient}} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{{
  const org = await p.organizador.findFirst({{ where: {{ email: '{EMAIL}' }}, include: {{ tenant: true }} }});
  const pix = org.tenant.pixChave;
  // replicate internal norm via ensureSubconta path
  const digits = String(pix).replace(/\\D/g,'');
  const asPhone = '+55' + digits;
  console.log('PIX:', pix);
  console.log('Como telefone (+55):', asPhone);
  console.log('Como CPF:', digits);

  for (const [label, key] of [['CPF', digits], ['PHONE', asPhone]]) {{
    try {{
      const data = await WooviService._request('/subaccount/' + encodeURIComponent(key));
      console.log(label, 'EXISTE:', JSON.stringify(data?.subAccount || data));
    }} catch(e) {{
      console.log(label, 'ERRO:', e.message.slice(0,200));
    }}
  }}

  console.log('\\n--- ensureSubconta ---');
  try {{
    await WooviService.ensureSubconta(org.tenant);
    console.log('ensureSubconta OK');
  }} catch(e) {{
    console.log('ensureSubconta FALHOU:', e.message);
  }}

  console.log('\\n--- teste criar cobranca R$1 ---');
  try {{
    const r = await WooviService.criarCobranca(org.tenant, {{
      correlationID: 'diag-jani-' + Date.now(),
      valorReais: 5,
      valorOrganizadorReais: 4.65,
      comentario: 'Teste diagnostico'
    }});
    console.log('COBRANCA OK:', r?.correlationID || r?.id || 'ok');
  }} catch(e) {{
    console.log('COBRANCA FALHOU:', e.message);
  }}

  await p.$disconnect();
}})().catch(e=>{{console.error(e.message);process.exit(1)}});
"""))

print("\n" + "=" * 60)
print("SCAN CPF CHAVES TRATADAS COMO TELEFONE")
print("=" * 60)
print(run_node("""
const {PrismaClient} = require('@prisma/client');
const { detectarTipoChavePix } = require('./lib/pixKey');
const p = new PrismaClient();
(async()=>{
  const orgs = await p.organizador.findMany({
    where: { tenant: { pixChave: { not: null }, mpAccessToken: null, status: 'ativo' } },
    include: { tenant: { select: { slug: true, pixChave: true } } }
  });
  const bug = orgs.filter(o => {
    const tipo = detectarTipoChavePix(o.tenant.pixChave);
    const digits = String(o.tenant.pixChave).replace(/\\D/g,'');
    const wronglyPhone = tipo === 'cpf' && digits.length === 11;
    return wronglyPhone;
  }).map(o => ({
    email: o.email,
    slug: o.tenant.slug,
    pix: o.tenant.pixChave,
    tipo: detectarTipoChavePix(o.tenant.pixChave),
    wooviWrongKey: '+55' + String(o.tenant.pixChave).replace(/\\D/g,'')
  }));
  console.log(JSON.stringify({ totalCpfPix: bug.length, lista: bug.slice(0, 40) }, null, 2));
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
"""))
