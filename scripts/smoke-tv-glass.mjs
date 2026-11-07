// scripts/smoke-tv-glass.mjs — Bun; live EPG + glass cards in Cloudflare Worker/Chrome.
import { spawn, spawnSync } from "node:child_process";
const BASE="http://127.0.0.1:4192";
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local","--ip","127.0.0.1","--port","4192"],{
  stdio:["ignore","pipe","pipe"]
});
let logs="";
for(const stream of [worker.stdout,worker.stderr])stream.on("data",chunk=>{logs=(logs+String(chunk)).slice(-3400);});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path,ms=66000){
  const response=await fetch(BASE+path,{cache:"no-store",signal:AbortSignal.timeout(ms)});
  const text=await response.text();
  let json=null;try{json=JSON.parse(text);}catch{}
  return {status:response.status,text,json,mime:response.headers.get("content-type")};
}
try{
 let ready=false;
 for(let i=0;i<60;i++){
  if(worker.exitCode!==null)throw Error("Wrangler exited: "+logs);
  try{if((await fetch(BASE+"/api/version",{signal:AbortSignal.timeout(1700)})).ok){ready=true;break;}}catch{}
  await sleep(320);
 }
 if(!ready)throw Error("Wrangler not ready: "+logs);
 const [catalog,epg]=await Promise.all([get("/api/canais"),get("/api/epg/agora")]);
 if(catalog.status!==200||!Array.isArray(catalog.json?.canais))throw Error("Channel catalog unavailable");
 if(epg.status!==200||!Array.isArray(epg.json))throw Error("Live EPG unavailable");
 const channels=catalog.json.canais;
 const grade=epg.json;
 const current=grade.filter(x=>x.atual?.titulo);
 const upcoming=grade.filter(x=>x.proximo?.titulo);
 const rich=current.filter(x=>x.atual?.inicioEm&&x.atual?.fimEm);
 const invalidNow=current.filter(x=>Date.parse(x.atual.fimEm||"") <= Date.now());
 const wrong=grade.filter(x=>x.atual?.titulo && !x.canalNome);
 console.log(JSON.stringify({event:"tv-glass-epg",
  channels:channels.length,records:grade.length,current:current.length,upcoming:upcoming.length,
  withPreciseInterval:rich.length,expiredCurrent:invalidNow.length,invalidNames:wrong.length,
  sample:current.slice(0,9).map(x=>({channel:x.canalNome,title:x.atual.titulo,
    category:x.atual.categoria,start:x.atual.horario,end:x.atual.fim,
    next:x.proximo?.titulo}))
 }));
 if(grade.length < channels.length*0.75||wrong.length||invalidNow.length)throw Error("EPG mismatch or stale NOW programme");
 if(current.length===0)throw Error("No verified live programme names found in EPG");
 if(rich.length < current.length*.7)throw Error("EPG missing precise intervals");
 const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync("which",[x]).status===0);
 if(!chrome)throw Error("Chrome missing");
 const result=spawnSync(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
  "--disable-background-networking","--disable-extensions","--virtual-time-budget=17000",
  "--window-size=1440,1000","--dump-dom",BASE+"/tv"],{
    encoding:"utf8",timeout:45000,maxBuffer:18*1024*1024
  });
 const html=result.stdout||"";
 const metrics={event:"tv-glass-browser",status:result.status,
  htmlBytes:html.length,hasGlass:html.includes("ztv-explore-glass"),
  hasCards:html.includes("ztv-card-glass"),hasNowTitles:html.includes("ztv-card-program-title"),
  hasFilters:html.includes("Com programação identificada"),
  hasProgramSearch:html.includes("Busque seu canal ou programa favorito"),
  hasTechnicalCounters:html.includes('class="ztv-statbar"') || html.includes('class="ydo-clock-pill"'),
  hasZangBrand:html.includes("ZANG FLIX"),
  visibleCards:(html.match(/class="ztv-card-main"/g)||[]).length,
  currentLabels:(html.match(/AGORA PASSANDO/g)||[]).length,
  missingText:html.includes("Programação não informada"),
  legacyVisible:/>[^<]*Saimo TV[^<]*</i.test(html),
 };
 console.log(JSON.stringify(metrics));
 if(result.status!==0 || !metrics.hasGlass || !metrics.hasCards || !metrics.hasNowTitles ||
    !metrics.hasFilters || !metrics.hasProgramSearch || metrics.hasTechnicalCounters || metrics.legacyVisible ||
    metrics.visibleCards<10)throw Error("Zang Flix glass card DOM failed"+String(result.stderr).slice(0,400));
 // Confirm the programme API and page represent the same channel catalog, rather
 // than receiving randomly chosen titles from mismatched schedules.
 const verified=new Map(grade.map(x=>[x.canalNome,x]));
 const recognizable=channels.slice(0,48).filter(ch=>verified.get(ch.nome)?.atual?.titulo);
 console.log(JSON.stringify({event:"tv-glass-cross-check",first48WithEPG:recognizable.length}));
} finally {
  worker.kill("SIGTERM");
}
