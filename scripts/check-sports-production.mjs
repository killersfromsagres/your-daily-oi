// scripts/check-sports-production.mjs — Bun; verify public Zang Sports production deployment.
const BASE="https://zangflix.vercel.app";
const paths=["/api/version","/tv","/api/jogos-agenda?data=2026-11-07","/api/jogos-hoje?data=2026-11-07"];
let failures=0;
for(const path of paths){
 try{
  const res=await fetch(BASE+path,{signal:AbortSignal.timeout(50000),cache:"no-store",headers:{Accept:"application/json,text/html,*/*"}});
  const contentType=res.headers.get("content-type")||"";
  const body=await res.text();
  let data=null;
  try{data=JSON.parse(body)}catch{}
  const expected=path.startsWith("/api/jogos");
  const result={
    event:"public-sports-deployment",path,status:res.status,contentType,
    sportsVisible:path==="/tv"?body.includes("zgame-center"):undefined,
    games:expected?data?.jogos?.length:undefined,
    leagues:expected?[...new Set((data?.jogos||[]).map(x=>x.ligaId))].slice(0,20):undefined,
    linked:expected?data?.jogos?.filter(x=>x.canalId).length:undefined,
    sources:expected?data?.fontesConsultadas:undefined,
    localDate:expected?data?.dataLocal:undefined,
    error:res.ok?undefined:(data?.erro||body.slice(0,180).replace(/\s+/g," ")),
  };
  console.log(JSON.stringify(result));
  if(!res.ok || (path==="/tv"&&!result.sportsVisible) || (expected&&(
    result.localDate!=="2026-11-07"||!Array.isArray(data?.jogos)||!result.sources))){
    failures++;
  }
 }catch(e){
  failures++;
  console.log(JSON.stringify({event:"public-sports-deployment",path,error:String(e).slice(0,160)}));
 }
}
if(failures)throw new Error("Public sports deployment had "+failures+" failing checks");
