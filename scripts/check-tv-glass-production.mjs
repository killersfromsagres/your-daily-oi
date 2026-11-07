// scripts/check-tv-glass-production.mjs — Bun; verify live Zang Flix production page, catalog and EPG.
const BASE = "https://zangflix.vercel.app";
async function request(path, timeout=45000) {
  let last;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const res=await fetch(BASE+path,{cache:"no-store",signal:AbortSignal.timeout(timeout),
        headers:{Accept:"application/json,text/html,*/*","User-Agent":"ZangFlix-Production-Smoke/1.0"}});
      const body=await res.text();
      let data=null;try{data=JSON.parse(body);}catch{}
      if(res.status>=500 && attempt<4){last=new Error("HTTP "+res.status);await new Promise(r=>setTimeout(r,2000));continue;}
      return {status:res.status,mime:res.headers.get("content-type")||"",body,data};
    }catch(err){
      last=err;
      if(attempt<4)await new Promise(r=>setTimeout(r,2000));
    }
  }
  throw last||new Error("Request failed");
}
const endpoints=["/tv","/api/canais","/api/epg/agora","/api/version"];
let errors=0;
for(const path of endpoints){
 try{
  const r=await request(path);
  let result={event:"zang-glass-production",path,status:r.status,mime:r.mime};
  if(path==="/tv"){
    result={...result,hasGlass:r.body.includes("ztv-explore-glass"),
      hasFilter:r.body.includes("Com programação identificada"),
      hasBrand:r.body.includes("ZANG FLIX")||r.body.includes("Zang Flix"),
      oldBrand:/>[^<]*Saimo TV[^<]*</i.test(r.body)};
    if(!result.hasGlass||!result.hasFilter||!result.hasBrand||result.oldBrand)errors++;
  }else if(path==="/api/canais"){
    result={...result,channels:r.data?.canais?.length};
    if(!Array.isArray(r.data?.canais)||r.data.canais.length<200)errors++;
  }else if(path==="/api/epg/agora"){
    const entries=Array.isArray(r.data)?r.data:[];
    const active=entries.filter(x=>x.atual?.titulo);
    result={...result,records:entries.length,onAir:active.length,
      withISO:active.filter(x=>x.atual.inicioEm&&x.atual.fimEm).length,
      samples:active.slice(0,4).map(x=>({channel:x.canalNome,title:x.atual.titulo}))};
    if(entries.length<200||active.length<100||result.withISO<80)errors++;
  }
  console.log(JSON.stringify(result));
  if(r.status!==200)errors++;
 }catch(e){
  errors++;
  console.log(JSON.stringify({event:"zang-glass-production",path,error:String(e).slice(0,200)}));
 }
}
if(errors)throw new Error("Zang Flix production UI or EPG failed "+errors+" validations");
