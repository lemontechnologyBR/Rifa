import os
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HOST=os.environ['VOURIFAR_SSH_HOST']; PASS=os.environ['VOURIFAR_SSH_PASS']; CONTAINER='vourifar-rifas-1'
NEW_EVP='dfdb7f42-895b-4275-9f28-45cf553dcd7a'
OLD_ACC='6a1b283ae04a8ada90ec0118'
VALUE=50000  # R$ 500

SCRIPT=r'''
const API=process.env.WOOVI_API_BASE||'https://api.woovi.com/api/v1';
const OLD=process.env.WOOVI_APP_ID;
const NEW_EVP=process.env.NEW_EVP;
const VALUE=Number(process.env.VALUE);
const OLD_ACCOUNT_ID=process.env.OLD_ACCOUNT_ID;
async function req(path,opts={}){
  const r=await fetch(API+path,{...opts,headers:{Authorization:OLD,Accept:'application/json','Content-Type':'application/json'}});
  const t=await r.text(); let d; try{d=JSON.parse(t)}catch{d={raw:t.slice(0,400)}};
  return {ok:r.ok,status:r.status,d};
}
(async()=>{
  const acc=await req('/account/'+OLD_ACCOUNT_ID);
  console.log('MAIN', JSON.stringify(acc.d?.account?.balance));
  const available=Number(acc.d?.account?.balance?.available||0);
  const send=Math.min(VALUE, available);
  console.log('TRY_SEND_REAIS', send/100);
  const correlationID='migrate-500-'+Date.now();
  const pay=await req('/payment',{method:'POST',body:JSON.stringify({
    type:'PIX_KEY', value:send, destinationAlias:NEW_EVP, destinationAliasType:'RANDOM',
    comment:'Migracao parcial 500', correlationID, autoApprove:true
  })});
  console.log('PAY', pay.status, JSON.stringify(pay.d).slice(0,500));
})().catch(e=>{console.error(e);process.exit(1)});
'''

c=paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='root', password=PASS, timeout=20, look_for_keys=False, allow_agent=False)
esc=SCRIPT.replace("'", "'\\''")
cmd=(f"docker exec -e NEW_EVP='{NEW_EVP}' -e OLD_ACCOUNT_ID='{OLD_ACC}' -e VALUE='{VALUE}' "
     f"-w /app {CONTAINER} node -e '{esc}'")
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode(errors='replace'))
print(e.read().decode(errors='replace')[:300])
c.close()
