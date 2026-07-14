import os
import paramiko, json

HOST = os.environ["VOURIFAR_SSH_HOST"]
USER = "root"
PASS = os.environ["VOURIFAR_SSH_PASS"]
EMAIL = "marlucyfuregatibrito@gmail.com"
CONTAINER = "vourifar-rifas-1"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=20,
          look_for_keys=False, allow_agent=False)

def run_node(script, label):
    print(f"\n{'='*60}\n  {label}\n{'='*60}")
    escaped = script.replace("'", "'\\''")
    cmd = f"docker exec {CONTAINER} node -e '{escaped}'"
    _, o, e = c.exec_command(cmd, timeout=30)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    if out: print(out)
    if err and 'ExperimentalWarning' not in err and err not in out:
        print("[ERR]", err[:300])
    return out

EMAIL_JS = EMAIL

run_node(f"""
const {{PrismaClient}} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{{
  const org = await p.organizador.findFirst({{
    where:{{email:'{EMAIL_JS}'}},
    include:{{tenant:true}}
  }});
  if(!org){{console.log('ORGANIZADOR NAO ENCONTRADO');return;}}
  const t = org.tenant;
  console.log('--- ORGANIZADOR ---');
  console.log('ID:', org.id, '| Nome:', org.nome, '| Email:', org.email);
  console.log('--- TENANT ---');
  console.log('ID:', t.id, '| Slug:', t.slug, '| Nome:', t.nome, '| Status:', t.status);
  console.log('PIX chave:', t.pixChave || 'NENHUMA');
  console.log('MP User ID:', t.mpUserId || 'NAO CONECTADO');
  console.log('MP Access Token:', t.mpAccessToken ? 'PRESENTE' : 'AUSENTE');
  console.log('Woovi ativo:', t.wooviAtivo);
  await p.$disconnect();
}})().catch(e=>{{console.error(e.message);process.exit(1)}});
""", "ORGANIZADOR E TENANT")

run_node(f"""
const {{PrismaClient}} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{{
  const org = await p.organizador.findFirst({{where:{{email:'{EMAIL_JS}'}},select:{{tenantId:true}}}});
  if(!org){{console.log('NAO ENCONTRADO');return;}}
  const rifas = await p.rifa.findMany({{
    where:{{tenantId:org.tenantId}},
    include:{{_count:{{select:{{numeros:{{where:{{status:'vendido'}}}}}}}}}},
    orderBy:{{createdAt:'desc'}}
  }});
  rifas.forEach(r=>{{
    console.log(`ID:${{r.id}} | ${{r.titulo}} | Status:${{r.status}} | Cota:R$${{r.valorCota}} | Vendidos:${{r._count.numeros}}`);
  }});
  await p.$disconnect();
}})().catch(e=>{{console.error(e.message);process.exit(1)}});
""", "RIFAS DO TENANT")

run_node(f"""
const {{PrismaClient}} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{{
  const org = await p.organizador.findFirst({{where:{{email:'{EMAIL_JS}'}},select:{{tenantId:true}}}});
  if(!org){{console.log('NAO ENCONTRADO');return;}}
  const rifaIds = (await p.rifa.findMany({{where:{{tenantId:org.tenantId}},select:{{id:true}}}})).map(r=>r.id);
  if(!rifaIds.length){{console.log('SEM RIFAS');return;}}

  // Agrupar por status + gateway
  const res = await p.reserva.findMany({{
    where:{{rifaId:{{in:rifaIds}}}},
    select:{{statusPagamento:true,valorTotal:true,wooviCorrelationId:true}}
  }});

  const grupos = {{}};
  for(const r of res){{
    const gw = r.wooviCorrelationId ? 'WOOVI/PIX' : 'MP';
    const k = r.statusPagamento+'|'+gw;
    if(!grupos[k]) grupos[k]={{status:r.statusPagamento,gw,qtd:0,total:0}};
    grupos[k].qtd++;
    grupos[k].total += Number(r.valorTotal||0);
  }}
  Object.values(grupos).forEach(g=>{{
    console.log(`[${{g.status}}][${{g.gw}}] qtd=${{g.qtd}} total=R$${{g.total.toFixed(2)}}`);
  }});
  await p.$disconnect();
}})().catch(e=>{{console.error(e.message);process.exit(1)}});
""", "RESERVAS POR STATUS E GATEWAY")

run_node(f"""
const {{PrismaClient}} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{{
  const org = await p.organizador.findFirst({{where:{{email:'{EMAIL_JS}'}},select:{{tenantId:true}}}});
  if(!org){{console.log('NAO ENCONTRADO');return;}}
  const rifaIds = (await p.rifa.findMany({{where:{{tenantId:org.tenantId}},select:{{id:true}}}})).map(r=>r.id);

  const res = await p.reserva.findMany({{
    where:{{rifaId:{{in:rifaIds}},statusPagamento:'confirmado'}},
    select:{{id:true,valorTotal:true,wooviCorrelationId:true,createdAt:true}},
    orderBy:{{createdAt:'desc'}}
  }});

  let totalWoovi=0, totalMp=0;
  res.forEach(r=>{{
    const gw = r.wooviCorrelationId?'WOOVI':'MP';
    const v = Number(r.valorTotal||0);
    if(gw==='WOOVI') totalWoovi+=v; else totalMp+=v;
    console.log(`ID:${{r.id}} | ${{gw}} | R$${{v.toFixed(2)}} | ${{new Date(r.createdAt).toLocaleString('pt-BR')}}`);
  }});
  console.log('---');
  console.log('Total Woovi/PIX confirmado:', 'R$'+totalWoovi.toFixed(2));
  console.log('Total MP confirmado:', 'R$'+totalMp.toFixed(2));
  await p.$disconnect();
}})().catch(e=>{{console.error(e.message);process.exit(1)}});
""", "VENDAS CONFIRMADAS (detalhe)")

run_node(f"""
const {{PrismaClient}} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{{
  const org = await p.organizador.findFirst({{where:{{email:'{EMAIL_JS}'}},select:{{tenantId:true}}}});
  if(!org){{console.log('NAO ENCONTRADO');return;}}
  const saques = await p.saque.findMany({{
    where:{{tenantId:org.tenantId}},
    orderBy:{{createdAt:'desc'}}
  }});
  if(!saques.length){{console.log('NENHUM SAQUE ENCONTRADO');return;}}
  saques.forEach(s=>{{
    console.log(`ID:${{s.id}} | Status:${{s.status}} | Bruto:R$${{Number(s.valorBruto).toFixed(2)}} | Liq:R$${{Number(s.valorLiquido).toFixed(2)}} | ${{new Date(s.createdAt).toLocaleString('pt-BR')}}`);
    if(s.erroMsg) console.log('  ERRO:', s.erroMsg);
  }});
  await p.$disconnect();
}})().catch(e=>{{console.error(e.message);process.exit(1)}});
""", "SAQUES DO TENANT")

c.close()
print("\n✅ Diagnóstico concluído.")
