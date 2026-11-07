// scripts/smoke-sports-center.mjs — Bun, Vercel-compatible Cloudflare worker sports API smoke.
import { spawn, spawnSync } from "node:child_process";
import { dataBrasilia, horaBrasilia } from "../src/lib/jogos-match.ts";
const PORT=4180,BASE="http://127.0.0.1:"+PORT;
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local","--ip","127.0.0.1","--port",String(PORT)],{stdio:["ignore","pipe","pipe"]});
let log="";
for(const stream of [worker.stdout,worker.stderr])stream.on("data",b=>{log=(log+String(b)).slice(-3000)});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function req(path,timeout=55000){
 const res=await fetch(BASE+path,{signal:AbortSignal.timeout(timeout),headers:{Accept:"application/json,text/html,*/*"}});
 const text=await res.text();
 let data=null;try{data=JSON.parse(text)}catch{}
 return {status:res.status,contentType:res.headers.get("content-type"),data,text};
}
try{
 let ready=false;
 for(let i=0;i<60;i++){
  if(worker.exitCode!==null)throw Error("Wrangler exited "+worker.exitCode+"\n"+log);
  try{const res=await fetch(BASE+"/api/version",{signal:AbortSignal.timeout(1200)});if(res.ok){ready=true;break;}}catch{}
  await pause(350);
 }
 if(!ready)throw Error("Worker not ready "+log);
 const html=await req("/tv",12000);
 if(html.status!==200||!html.text.includes("zgame-center"))throw Error("Sports center missing from TV SSR route");
 console.log(JSON.stringify({event:"sports-page",status:html.status,section:html.text.includes("zgame-center"),days:html.text.includes("zgame-days"),title:html.text.includes("Hoje tem")}));
 const date=dataBrasilia();
 const response=await req("/api/jogos-agenda?data="+date);
 if(response.status!==200||!Array.isArray(response.data?.jogos))throw Error("Sports API failed "+response.status+" "+response.text.slice(0,300));
 const games=response.data.jogos;
 console.log(JSON.stringify({event:"sports-api",date,fetches:response.data.fontesConsultadas,missing:response.data.ligasIndisponiveis,length:games.length,
  leagues:[...new Set(games.map(g=>g.ligaId))],linked:games.filter(g=>g.canalId).length,sample:games.slice(0,5).map(g=>({liga:g.liga,home:g.casa,away:g.fora,day:g.dataLocal,time:g.horarioLocal,crest:!!g.escudoCasa,linked:!!g.canalId,status:g.status}))}));
 if(response.data.dataLocal!==date||response.data.fontesConsultadas===0)throw Error("Sports API empty/unreliable provider");
 for(const game of games){
  if(game.dataLocal!==date)throw Error("Wrong local date "+game.id);
  if(game.horarioLocal!==horaBrasilia(new Date(game.inicioIso)))throw Error("Wrong local kickoff "+game.id);
  if(game.canalId&&!game.canalNome)throw Error("Unidentified broadcaster "+game.id);
  if(game.transmissao==="confirmada"&&!game.canalId)throw Error("Broadcast status without channel "+game.id);
 }
 const bad=await req("/api/jogos-agenda?data=2026-99-99",5000);
 if(bad.status!==400)throw Error("Invalid date should return 400, got "+bad.status);
 console.log(JSON.stringify({event:"sports-validation",invalidDateStatus:bad.status,pass:true}));
 const browser=["google-chrome","chromium","chromium-browser"].find(x=>spawnSync("which",[x]).status===0);
 if(browser){
  const res=spawnSync(browser,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--disable-extensions","--autoplay-policy=no-user-gesture-required","--virtual-time-budget=17000",
    "--window-size=1440,1000","--dump-dom",BASE+"/tv"],{encoding:"utf8",timeout:35000,maxBuffer:14*1024*1024});
  const dom=res.stdout||"";
  console.log(JSON.stringify({event:"sports-chrome",status:res.status,dayButtons:(dom.match(/class="zgame-day(?: is-active)?"/g)||[]).length,
    sportsCards:(dom.match(/class="zgame-card /g)||[]).length,hasLogo:dom.includes("zgame-crest"),hasBrasilia:dom.includes("Horário de Brasília")}));
  if(res.status!==0 || !dom.includes("zgame-center") || !dom.includes("zgame-days") || !dom.includes("Horário de Brasília")){
    throw Error("Sports center not rendered in Chrome");
  }
 }
}finally{worker.kill("SIGTERM");}
