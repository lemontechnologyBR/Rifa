import os
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HOST=os.environ['VOURIFAR_SSH_HOST']; PASS=os.environ['VOURIFAR_SSH_PASS']; CONTAINER='vourifar-rifas-1'
OLD_ACC='6a1b283ae04a8ada90ec0118'
SCRIPT=r'''
const API=process.env.WOOVI_API_BASE||'https://api.woovi.com/api/v1';
const OLD=process.env.WOOVI_APP_ID;
async function req(path,opts={}){
  const r=await fetch(API+path,{...opts,headers:{Authorization:OLD,Accept:'application/json','Content-Type':'application/json'}});
  const t=await r.text(); let d; try{d=JSON.parse(t)}catch{d={raw:t.slice(0,300)}};
  return {ok:r.ok,status:r.status,d};
}
function pickList(data){
  if(Array.isArray(data?.subAccounts)) return data.subAccounts;
  if(data?.subAccounts?.subaccount){const s=data.subAccounts.subaccount;return Array.isArray(s)?s:[s];}
  return [];
}
(async()=>{
  const acc=await req('/account/'+process.env.OLD_ACCOUNT_ID);
  console.log('MAIN', JSON.stringify(acc.d.account.balance));
  const list=await req('/subaccount?skip=0&limit=100');
  const all=pickList(list.d);
  let more=all;
  if(list.d.pageInfo?.hasNextPage){
    const l2=await req('/subaccount?skip=100&limit=100');
    more=all.concat(pickList(l2.d));
  }
  const withBal=more.filter(s=>Number(s.balance||0)>0);
  const total=more.reduce((a,s)=>a+Number(s.balance||0),0);
  console.log('SUBS', more.length, 'comSaldo', withBal.length, 'totalReais', total/100);
  console.log('TOP', JSON.stringify(withBal.slice(0,5)));

  // try withdraw endpoint (to own bank) — only probe with 0? skip destructive
  // try payment without autoApprove
  // try alternate payment payload
  for (const body of [
    {type:'PIX_KEY', value:100, destinationAlias:process.env.NEW_EVP, destinationAliasType:'RANDOM', correlationID:'probe-'+Date.now()},
  ]) {
    const p=await req('/payment',{method:'POST',body:JSON.stringify(body)});
    console.log('PAY_PROBE', p.status, JSON.stringify(p.d).slice(0,250));
  }
})().catch(e=>{console.error(e);process.exit(1)});
'''
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST,username='root',password=PASS,timeout=20,look_for_keys=False,allow_agent=False)
esc=SCRIPT.replace("'","'\\''")
cmd=f"docker exec -e OLD_ACCOUNT_ID='{OLD_ACC}' -e NEW_EVP='dfdb7f42-895b-4275-9f28-45cf553dcd7a' -w /app {CONTAINER} node -e '{esc}'"
_,o,e=c.exec_command(cmd,timeout=120)
print(o.read().decode(errors='replace'))
print(e.read().decode(errors='replace')[:300])
c.close()
