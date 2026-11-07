// scripts/check-premium-public.mjs — Bun; check Zang Flix live Vercel deployment.
const BASE="https://zangflix.vercel.app";
const cases=[
 {path:"/futebol",kind:"football"},
 {path:"/tv",kind:"tv"},
 {path:"/api/jogos-agenda?data=2026-11-07",kind:"api"},
 {path:"/",kind:"home"}
];
let failures=0;
for(const item of cases){
  try{
    const r=await fetch(BASE+item.path,{signal:AbortSignal.timeout(35000),cache:"no-store",
      headers:{Accept:"text/html,application/json,*/*", "User-Agent":"ZangFlix-Production-Verification/1.0"}});
    const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}
    const result={event:"premium-public",path:item.path,status:r.status,mime:r.headers.get("content-type"),
      footballSSR:raw.includes("zf-football-page"),
      footballNav:raw.includes("ydo-nav-football"),
      hasWatchHistory:raw.includes("zf-episode-progress-controls"),
      sportsPage:raw.includes("Todos os"),
      fixtures:j?.jogos?.length,leagues:j?.fontesConsultadas,localDate:j?.dataLocal,
      title:(raw.match(/<title[^>]*>(.*?)<\/title>/i)||[])[1]||null
    };
    console.log(JSON.stringify(result));
    if(item.kind==="football" && (r.status!==200 || !result.footballSSR))failures++;
    if(item.kind==="home" && (r.status!==200 || !result.footballNav))failures++;
    if(item.kind==="api" && (r.status!==200 || !Array.isArray(j?.jogos) || j?.dataLocal!=="2026-11-07"))failures++;
    if(item.kind==="tv" && r.status!==200)failures++;
  }catch(e){
    failures++;
    console.log(JSON.stringify({event:"premium-public",path:item.path,error:String(e).slice(0,230)}));
  }
}
if(failures)throw new Error("Live deployment not confirmed: "+failures+" failed checks");
