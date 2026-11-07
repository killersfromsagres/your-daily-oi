// scripts/smoke-mobile-menu-navigation.mjs — browser click-through of responsive navigation.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE="http://127.0.0.1:4197", CDP_PORT=9228;
const bin=["google-chrome","google-chrome-stable","chromium","chromium-browser"]
 .find(x=>spawnSync("which",[x]).status===0);
if(!bin)throw Error("Chrome/Chromium missing");
const temp=mkdtempSync(join(tmpdir(),"zf-menu-"));
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local",
 "--ip","127.0.0.1","--port","4197"],{stdio:"ignore"});
let chrome,socket;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(url){
 for(let i=0;i<70;i++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.ok)return await r.json().catch(()=>true);}
  catch{}await sleep(350);
 }
 throw Error("Timed out: "+url);
}
try{
 await ready(BASE+"/api/version");
 chrome=spawn(bin,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
 "--disable-background-networking","--no-first-run","--remote-allow-origins=*",
 "--remote-debugging-port="+CDP_PORT,"--user-data-dir="+temp,"about:blank"],{stdio:"ignore"});
 const tabs=await ready("http://127.0.0.1:"+CDP_PORT+"/json/list");
 const page=tabs.find(t=>t.type==="page");
 if(!page?.webSocketDebuggerUrl)throw Error("Chrome tab not available");
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error("Chrome websocket timeout")),6000);
  socket.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});
  socket.addEventListener("error",()=>{clearTimeout(timer);reject(Error("Chrome websocket error"));},{once:true});
 });
 let id=0;
 const pending=new Map();
 socket.addEventListener("message",event=>{
  const data=JSON.parse(String(event.data));const p=pending.get(data.id);if(!p)return;
  clearTimeout(p.timer);pending.delete(data.id);
  data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);
 });
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error("CDP timed out: "+method));},12000);
  pending.set(n,{resolve,reject,timer});
  socket.send(JSON.stringify({id:n,method,params}));
 });
 const evaluate=async expression=>{
  const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text||"JS exception");
  return r.result?.value;
 };
 const until=async(expr,label)=>{
  for(let i=0;i<65;i++){
   try{if(await evaluate(expr))return;}catch{}
   await sleep(300);
  }throw Error("Menu navigation timed out: "+label);
 };
 await send("Page.enable");
 await send("Runtime.enable");
 await send("Network.enable");
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send("Emulation.setTouchEmulationEnabled",{enabled:true});
 await send("Network.setUserAgentOverride",{userAgent:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36"});
 await send("Page.navigate",{url:BASE+"/"});
 await until("document.readyState==='complete' && !!document.querySelector('.zf-mobile-dock a[href=\"/generos/filmes\"]')","Home hydration");
 await evaluate("document.querySelector('.zf-mobile-dock a[href=\"/generos/filmes\"]').click()");
 await until("location.pathname==='/generos/filmes' && !!document.querySelector('.ydo-search-page')","Filmes tab");
 await sleep(750);
 const filmes=await evaluate("({path:location.pathname,cards:document.querySelectorAll('.ydo-search-page .ydo-card').length,overflow:document.body.style.overflow})");
 if(filmes.cards>36||filmes.overflow==="hidden")throw Error("Filmes freezes UI: "+JSON.stringify(filmes));
 await evaluate("document.querySelector('.zf-mobile-menu-tab').click()");
 await until("!!document.querySelector('.zf-mobile-menu-panel a[href=\"/generos/series\"]')","Drawer open");
 await evaluate("document.querySelector('.zf-mobile-menu-panel a[href=\"/generos/series\"]').click()");
 await until("location.pathname==='/generos/series' && !document.querySelector('.zf-mobile-menu-panel')","Séries drawer link");
 await sleep(750);
 const series=await evaluate("({path:location.pathname,cards:document.querySelectorAll('.ydo-search-page .ydo-card').length,overflow:document.body.style.overflow})");
 if(series.cards>36||series.overflow==="hidden")throw Error("Séries freezes UI: "+JSON.stringify(series));
 await evaluate("document.querySelector('.zf-mobile-menu-tab').click()");
 await until("!!document.querySelector('.zf-mobile-menu-panel a[href=\"/animes\"]')","Drawer reopened");
 await evaluate("document.querySelector('.zf-mobile-menu-panel a[href=\"/animes\"]').click()");
 await until("location.pathname==='/animes' && !document.querySelector('.zf-mobile-menu-panel')","Animes drawer link");
 const animes=await evaluate("({path:location.pathname,overflow:document.body.style.overflow,nav:!!document.querySelector('.zf-mobile-dock')})");
 if(animes.overflow==="hidden"||!animes.nav)throw Error("Animes navigation froze: "+JSON.stringify(animes));
 console.log(JSON.stringify({event:"mobile-menu-click-through",filmes,series,animes}));
}finally{
 socket?.close();
 chrome?.kill("SIGTERM");
 worker.kill("SIGTERM");
 rmSync(temp,{recursive:true,force:true});
}
