import os
import paramiko, sys, time, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HOST=os.environ['VOURIFAR_SSH_HOST']; PASS=os.environ['VOURIFAR_SSH_PASS']; CONTAINER='vourifar-rifas-1'

PENDING = [
  ("wanessa23sales@gmail.com", 26596, "Maos que ajudam"),
  ("12170131302", 5047, "pixtips"),
  ("+5562992741650", 24660, "Rifa Solidaria"),
  ("+5585994059922", 949, "Fraternidade Jesus Orante"),
  ("+5511973678666", 7577, "Jogo americano croche"),
  ("07834105906", 2849, "Rifa da Beleza"),
  ("andreulucas10@hotmail.com", 1638, "Rifapremiada"),
  ("+5531982211527", 1098, "Kit Perfume Boticario"),
  # recheck ones that showed null
  ("+5531986880150", 19452, "Baile Festa Agosto"),
  ("79396470597", 17095, "GatosMimi"),
  ("42899680153", 949, "CCA-GG"),
  ("+5514998669073", 5696, "Kadu JBL"),
]

print("Esperando 65s rate limit...")
time.sleep(65)

SCRIPT = r'''
const API=process.env.WOOVI_API_BASE||'https://api.woovi.com/api/v1';
const OLD=process.env.WOOVI_APP_ID;
const ITEMS=JSON.parse(process.env.ITEMS);
async function req(path,opts={}){
  const r=await fetch(API+path,{...opts,headers:{Authorization:OLD,Accept:'application/json','Content-Type':'application/json'}});
  const t=await r.text(); let d; try{d=JSON.parse(t)}catch{d={raw:t.slice(0,200)}};
  return {ok:r.ok,status:r.status,d};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const out=[];
  for(const [pix,cents,name] of ITEMS){
    await sleep(800);
    let cur=await req('/subaccount/'+encodeURIComponent(pix));
    let bal=Math.round(Number(cur.d?.subAccount?.balance ?? cur.d?.balance ?? 0));
    if(!cur.ok){
      await req('/subaccount',{method:'POST',body:JSON.stringify({name:String(name).slice(0,64),pixKey:pix})});
      await sleep(500);
      cur=await req('/subaccount/'+encodeURIComponent(pix));
      bal=Math.round(Number(cur.d?.subAccount?.balance ?? cur.d?.balance ?? 0));
    }
    const need=cents-bal;
    if(need<=0){ out.push({pix,bal,action:'ok'}); continue; }
    await sleep(500);
    const cr=await req('/subaccount/'+encodeURIComponent(pix)+'/credit',{
      method:'POST', body:JSON.stringify({value:need, description:'Reversao migracao VouRifar'})
    });
    out.push({pix,need,ok:cr.ok,status:cr.status,err:cr.ok?null:cr.d});
    if(cr.status===429){
      console.log('RATE_LIMIT, waiting 65s');
      await sleep(65000);
      const cr2=await req('/subaccount/'+encodeURIComponent(pix)+'/credit',{
        method:'POST', body:JSON.stringify({value:need, description:'Reversao migracao VouRifar retry'})
      });
      out[out.length-1]={pix,need,ok:cr2.ok,status:cr2.status,err:cr2.ok?null:cr2.d,retry:true};
    }
  }
  console.log(JSON.stringify(out,null,2));
  // final verify
  await sleep(1000);
  for(const [pix,cents] of ITEMS.map(x=>[x[0],x[1]])){
    await sleep(400);
    const s=await req('/subaccount/'+encodeURIComponent(pix));
    const bal=Math.round(Number(s.d?.subAccount?.balance ?? s.d?.balance ?? 0));
    console.log('CHECK', pix, bal, '/', cents, bal===cents?'OK':'DIFF');
  }
})().catch(e=>{console.error(e);process.exit(1)});
'''

c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST,username='root',password=PASS,timeout=20,look_for_keys=False,allow_agent=False)
esc=SCRIPT.replace("'","'\\''")
items=json.dumps(PENDING)
cmd=f"docker exec -e ITEMS='{items}' -w /app {CONTAINER} node -e '{esc}'"
_,o,e=c.exec_command(cmd, timeout=600)
print(o.read().decode(errors='replace'))
print(e.read().decode(errors='replace')[:500])
c.close()
