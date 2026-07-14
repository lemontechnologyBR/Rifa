import os
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HOST=os.environ['VOURIFAR_SSH_HOST']; PASS=os.environ['VOURIFAR_SSH_PASS']; CONTAINER='vourifar-rifas-1'
NEW_EVP='dfdb7f42-895b-4275-9f28-45cf553dcd7a'
OLD_ACC='6a1b283ae04a8ada90ec0118'
# R$ 1000.00 em centavos
VALUE=100000

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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const acc=await req('/account/'+OLD_ACCOUNT_ID);
  console.log('MAIN', JSON.stringify(acc.d?.account?.balance));
  const available=Number(acc.d?.account?.balance?.available||0);
  const send=Math.min(VALUE, available);
  console.log('TRY_SEND_CENTS', send, 'reais', send/100);

  const correlationID='migrate-1k-'+Date.now();
  const payloads=[
    {type:'PIX_KEY', value:send, destinationAlias:NEW_EVP, destinationAliasType:'RANDOM', comment:'Migracao parcial 1000', correlationID, autoApprove:true},
    {type:'PIX_KEY', value:send, destinationAlias:NEW_EVP, destinationAliasType:'EVP', comment:'Migracao parcial 1000 b', correlationID:correlationID+'-b', autoApprove:true},
  ];
  for(const body of payloads){
    const pay=await req('/payment',{method:'POST',body:JSON.stringify(body)});
    console.log('PAY', body.destinationAliasType, pay.status, JSON.stringify(pay.d).slice(0,500));
    if(pay.ok){
      for(let i=0;i<10;i++){
        await sleep(4000);
        const st=await req('/payment/'+encodeURIComponent(body.correlationID));
        const status=st.d?.payment?.status||st.d?.status;
        console.log('STATUS', i, status||JSON.stringify(st.d).slice(0,200));
        if(['CONFIRMED','COMPLETED','APPROVED','FAILED','REJECTED','CANCELLED'].includes(String(status||'').toUpperCase())) break;
      }
      break;
    }
  }
  const acc2=await req('/account/'+OLD_ACCOUNT_ID);
  console.log('MAIN_AFTER', JSON.stringify(acc2.d?.account?.balance));
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
'''
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST,username='root',password=PASS,timeout=20,look_for_keys=False,allow_agent=False)
esc=SCRIPT.replace("'","'\\''")
cmd=(f"docker exec -e NEW_EVP='{NEW_EVP}' -e OLD_ACCOUNT_ID='{OLD_ACC}' -e VALUE='{VALUE}' "
     f"-w /app {CONTAINER} node -e '{esc}'")
_,o,e=c.exec_command(cmd,timeout=180)
print(o.read().decode(errors='replace'))
print(e.read().decode(errors='replace')[:400])
c.close()
