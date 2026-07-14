import os
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HOST=os.environ['VOURIFAR_SSH_HOST']; PASS=os.environ['VOURIFAR_SSH_PASS']; CONTAINER='vourifar-rifas-1'

SCRIPT=r'''
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
const API=process.env.WOOVI_API_BASE||'https://api.woovi.com/api/v1';
const APP=process.env.WOOVI_APP_ID;
const APP_OLD=process.env.WOOVI_APP_ID_OLD;

async function req(app, path){
  if(!app) return {status:0,d:{error:'no app'}};
  const r=await fetch(API+path,{headers:{Authorization:app,Accept:'application/json'}});
  const t=await r.text(); let d; try{d=JSON.parse(t)}catch{d={raw:t.slice(0,300)}};
  return {status:r.status,d};
}

(async()=>{
  const org=await p.organizador.findFirst({
    where:{email:'elivemmo2@gmail.com'},
    include:{tenant:true}
  });
  if(!org){ console.log('ORG_NOT_FOUND'); return; }
  const t=org.tenant;
  console.log('TENANT', JSON.stringify({
    id:t.id, slug:t.slug, nome:t.nome, pixChave:t.pixChave,
    wooviAtivo:t.wooviAtivo, mp:!!t.mpAccessToken, status:t.status
  }));

  const rifas=await p.rifa.findMany({where:{tenantId:t.id}, select:{id:true,titulo:true,status:true,valorCota:true}});
  console.log('RIFAS', JSON.stringify(rifas));
  const rifaIds=rifas.map(r=>r.id);

  const reservas=await p.reserva.findMany({
    where:{rifaId:{in:rifaIds}},
    orderBy:{createdAt:'desc'},
    take:20,
    include:{
      usuario:{select:{nome:true,email:true,telefone:true}},
      rifa:{select:{titulo:true}},
      _count:{select:{reservaNumeros:true}}
    }
  });
  console.log('RESERVAS', JSON.stringify(reservas.map(r=>({
    id:r.id, status:r.statusPagamento, valor:r.valorTotal,
    wooviId:r.wooviCorrelationId, qtd:r._count.reservaNumeros,
    user:r.usuario?.email, rifa:r.rifa?.titulo, em:r.createdAt
  })), null, 2));

  // Carteira resumo logic check
  const CarteiraService=require('./services/carteiraService');
  const resumo=await CarteiraService.obterResumo(t.id, t);
  console.log('RESUMO', JSON.stringify({
    saldoConfirmado:resumo.saldoConfirmado,
    saldoDisponivel:resumo.saldoDisponivel,
    pendente:resumo.pendente,
    cotas:resumo.cotasConfirmadas,
    totalSacado:resumo.totalSacado,
    woovi:resumo.woovi,
    mp:resumo.mercadopago
  }, null, 2));

  // Saques
  const saques=await p.saque.findMany({where:{tenantId:t.id}, orderBy:{createdAt:'desc'}, take:5});
  console.log('SAQUES', JSON.stringify(saques.map(s=>({id:s.id,status:s.status,bruto:s.valorBruto,taxa:s.taxa,liquido:s.valorLiquido,em:s.createdAt}))));

  // Check latest pending/confirmed charges on NEW and OLD woovi
  for(const r of reservas.slice(0,8)){
    const ref=r.wooviCorrelationId;
    if(!ref) { console.log('RES', r.id, 'sem correlationId'); continue; }
    if(/^\d+$/.test(String(ref))){
      console.log('RES', r.id, 'MP_REF', ref, r.statusPagamento);
      continue;
    }
    const n=await req(APP, '/charge/'+encodeURIComponent(ref));
    const o=APP_OLD ? await req(APP_OLD, '/charge/'+encodeURIComponent(ref)) : null;
    console.log('CHARGE', r.id, ref, 'NEW', n.status, JSON.stringify({
      status:n.d?.charge?.status||n.d?.status,
      value:n.d?.charge?.value,
      err:n.d?.error
    }).slice(0,200));
    if(o) console.log('CHARGE_OLD', r.id, o.status, JSON.stringify({
      status:o.d?.charge?.status||o.d?.status, err:o.d?.error
    }).slice(0,200));
  }

  // subconta saldo nova chave
  if(t.pixChave){
    const key=t.pixChave.includes('@')?t.pixChave:t.pixChave;
    const sn=await req(APP, '/subaccount/'+encodeURIComponent(key));
    console.log('SUB_NEW', sn.status, JSON.stringify(sn.d?.subAccount||sn.d).slice(0,250));
    if(APP_OLD){
      const so=await req(APP_OLD, '/subaccount/'+encodeURIComponent(key));
      console.log('SUB_OLD', so.status, JSON.stringify(so.d?.subAccount||so.d).slice(0,250));
      // also nubank key from screenshot
      const sn2=await req(APP, '/subaccount/'+encodeURIComponent('nubank@dark.net.br'));
      const so2=await req(APP_OLD, '/subaccount/'+encodeURIComponent('nubank@dark.net.br'));
      console.log('SUB_NEW_nubank', sn2.status, JSON.stringify(sn2.d?.subAccount||sn2.d).slice(0,200));
      console.log('SUB_OLD_nubank', so2.status, JSON.stringify(so2.d?.subAccount||so2.d).slice(0,200));
    }
  }

  // recent logs
  const logs=await p.logAdmin.findMany({where:{tenantId:t.id}, orderBy:{createdAt:'desc'}, take:10});
  console.log('LOGS', JSON.stringify(logs.map(l=>({acao:l.acao,det:l.detalhes,em:l.createdAt}))));

  await p.$disconnect();
})().catch(e=>{console.error('FAIL', e.message); process.exit(1)});
'''

c=paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='root', password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

# also grab recent docker logs related to demo/woovi
escaped=SCRIPT.replace("'","'\\''")
cmd=f"docker exec -w /app {CONTAINER} node -e '{escaped}'"
_,o,e=c.exec_command(cmd, timeout=90)
print(o.read().decode(errors='replace'))
print(e.read().decode(errors='replace')[:500])

print('\n=== LOGS ===')
_,o,_=c.exec_command(
  f"docker logs --tail=200 {CONTAINER} 2>&1 | grep -iE 'demo|elivemmo|Woovi|webhook|charge|reserva' | tail -60",
  timeout=30
)
print(o.read().decode(errors='replace'))
c.close()
