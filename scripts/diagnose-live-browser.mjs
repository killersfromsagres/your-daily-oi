// scripts/diagnose-live-browser.mjs — Bun, headless Chrome CDP with local Cloudflare Worker.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const browser=["google-chrome","chromium","chromium-browser"].find(x=>spawnSync("which",[x]).status===0);
if(!browser)throw new Error("Chrome unavailable");
const WORKER_PORT=4176, CDP_PORT=9226, BASE="http://127.0.0.1:"+WORKER_PORT;
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local","--ip","127.0.0.1","--port",String(WORKER_PORT)],{stdio:["ignore","pipe","pipe"]});
let workerLogs="";
worker.stderr.on("data",chunk=>{workerLogs=(workerLogs+String(chunk)).slice(-1000);});
const temp=mkdtempSync(path.join(os.tmpdir(),"live-chrome-"));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let chrome=null,ws=null;
try{
 let ready=false;
 for(let i=0;i<48;i++){
  try{const res=await fetch(BASE+"/api/version",{signal:AbortSignal.timeout(2000)});if(res.ok){ready=true;break;}}catch{}
  await sleep(300);
 }
 if(!ready)throw new Error("Worker unavailable: "+workerLogs);
 chrome=spawn(browser,[
  "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
  "--no-first-run","--no-default-browser-check","--disable-extensions",
  "--remote-allow-origins=*","--remote-debugging-port="+CDP_PORT,
  "--user-data-dir="+temp,"--autoplay-policy=no-user-gesture-required",
  "--mute-audio",BASE+"/tv/canal/band"
 ],{stdio:"ignore"});
 let endpoint=null;
 for(let i=0;i<30;i++){
  try{
   const data=await (await fetch("http://127.0.0.1:"+CDP_PORT+"/json/list",{signal:AbortSignal.timeout(1500)})).json();
   endpoint=data.find(item=>item.type==="page")?.webSocketDebuggerUrl||null;
   if(endpoint)break;
  }catch{}
  await sleep(300);
 }
 if(!endpoint)throw new Error("Chrome debugging page not found");
 ws=new WebSocket(endpoint);
 await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
 const pending=new Map();let index=0;const failed=[],warnings=[];
 ws.addEventListener("message",event=>{
  let m;try{m=JSON.parse(String(event.data));}catch{return;}
  if(typeof m.id==="number"){
   const p=pending.get(m.id);if(!p)return;pending.delete(m.id);
   if(m.error)p.reject(new Error(m.error.message));else p.resolve(m.result);
  }else if(m.method==="Network.responseReceived"){
   const response=m.params?.response;
   if(response?.status>=400&&failed.length<20){
     try{const u=new URL(response.url);failed.push({status:response.status,host:u.hostname,path:u.pathname.slice(0,72)});}catch{}
   }
  }else if(m.method==="Runtime.consoleAPICalled"){
   const line=(m.params?.args||[]).map(x=>x.value||x.description||"").join(" ").slice(0,210);
   if(/LivePlayer|Hls|m3u8|403|failed/i.test(line)&&warnings.length<20)warnings.push(line);
  }else if(m.method==="Runtime.exceptionThrown"){
   if(warnings.length<20)warnings.push("JS "+(m.params?.exceptionDetails?.text||"error"));
  }
 });
 function send(method,params={}){
  const id=++index;
  return new Promise((resolve,reject)=>{
   pending.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));
   setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(new Error(method+" timeout"));}},8500);
  });
 }
 await send("Runtime.enable");await send("Network.enable");await send("Page.enable");
 const expression='(() => { const v=document.querySelector("video"); const src=v?.currentSrc||""; return JSON.stringify({channel:document.querySelector(".ztv-now-copy h2")?.textContent, errorText:document.querySelector(".ydo-live-error-overlay h3")?.textContent||null,loading:!!document.querySelector(".ydo-live-skeleton-overlay"),video:v&&{paused:v.paused,muted:v.muted,time:Math.round(v.currentTime*100)/100,ready:v.readyState,network:v.networkState,error:v.error?.code||null,srcHost:src?new URL(src).hostname:null}}); })()';
 async function snapshot(time){
  const r=await send("Runtime.evaluate",{expression,returnByValue:true});
  console.log(JSON.stringify({event:"browser-snapshot",time,shot:JSON.parse(r.result?.value||"null")}));
 }
 await sleep(5000);await snapshot(5);
 await send("Runtime.evaluate",{expression:'(() => {const v=document.querySelector("video");if(v){v.muted=true;void v.play().catch(()=>{});}})()'});
 await sleep(9000);await snapshot(14);
 await sleep(9000);await snapshot(23);
 console.log(JSON.stringify({event:"browser-errors",failed,warnings}));
} finally {
 try{ws?.close();}catch{}
 try{chrome?.kill("SIGTERM");}catch{}
 worker.kill("SIGTERM");
 try{rmSync(temp,{recursive:true,force:true});}catch{}
}
