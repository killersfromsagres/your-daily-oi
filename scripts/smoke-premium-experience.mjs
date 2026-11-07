// scripts/smoke-premium-experience.mjs — Bun; Cloudflare Worker + real Chrome UI route tests.
import { spawn, spawnSync } from "node:child_process";
import { dataBrasilia } from "../src/lib/jogos-match.ts";
const BASE="http://127.0.0.1:4195";
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local","--ip","127.0.0.1","--port","4195"],{stdio:["ignore","pipe","pipe"]});
let logs="";
for(const stream of [worker.stdout,worker.stderr])stream.on("data",bytes=>logs=(logs+String(bytes)).slice(-2400));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path,timeout=45000){
 const response=await fetch(BASE+path,{signal:AbortSignal.timeout(timeout),cache:"no-store"});
 const body=await response.text();
 let json=null;try{json=JSON.parse(body)}catch{}
 return {status:response.status,body,json};
}
try{
 let ready=false;
 for(let i=0;i<75;i++){
  if(worker.exitCode!==null)throw Error("Wrangler exited: "+logs);
  try{const p=await fetch(BASE+"/api/version",{signal:AbortSignal.timeout(1200)});if(p.ok){ready=true;break;}}catch{}
  await wait(330);
 }
 if(!ready)throw Error("Worker not ready: "+logs);
 const day=dataBrasilia();
 const [home,tv,football,agenda]=await Promise.all([
  get("/",12000),get("/tv",12000),get("/futebol",12000),
  get("/api/jogos-agenda?data="+day,52000)
 ]);
 console.log(JSON.stringify({event:"premium-worker",day,
   home:home.status,tv:tv.status,football:football.status,agenda:agenda.status,
   games:agenda.json?.jogos?.length,source:agenda.json?.fontesConsultadas,
   hasFootballNav:home.body.includes("ydo-nav-football"),
   hasFootballPage:football.body.includes("zf-football-page"),
   hasSmallTVShelf:tv.body.includes("zgame-center")}));
 if([home.status,tv.status,football.status,agenda.status].some(s=>s!==200)||
   !home.body.includes("ydo-nav-football")||!football.body.includes("zf-football-page")||
   !Array.isArray(agenda.json?.jogos)||!agenda.json.fontesConsultadas)throw Error("New routes / football API failed");
 const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync("which",[x]).status===0);
 if(!chrome)throw Error("Chrome not found");
 for(const path of ["/futebol","/tv"]){
  const result=spawnSync(chrome,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--disable-extensions","--virtual-time-budget=21000","--window-size=1440,960",
    "--dump-dom",BASE+path],{encoding:"utf8",timeout:50000,maxBuffer:24*1024*1024});
  const dom=result.stdout||"";
  const summary={event:"premium-chrome",path,exit:result.status,
    ball:dom.includes("Bola de futebol"),nav:dom.includes("Jogos do Dia"),
    leagueMark:dom.includes("zgame-league-emblem"),games:(dom.match(/class="zgame-card/g)||[]).length,
    fullPage:dom.includes("zf-football-grid"),
    partialGuide:dom.includes("zf-featured-summary")};
  console.log(JSON.stringify(summary));
  if(result.status!==0||!summary.nav||!summary.ball||(path==="/futebol"&&!summary.fullPage)||
    (path==="/tv"&&!summary.partialGuide))throw Error("Football Chrome validation failed for "+path+" "+result.stderr.slice(0,200));
 }
}finally{worker.kill("SIGTERM");}
