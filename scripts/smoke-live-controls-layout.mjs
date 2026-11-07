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
const FIXTURE="\n<div class=\"ydo-live-player-container\" data-controls-visible=\"true\" data-controls-density=\"roomy\"\n style=\"position:relative;width:100%;height:340px;background:#08101a\">\n <div class=\"ydo-live-controls-bar\" style=\"opacity:1\">\n  <div class=\"ydo-live-controls-left\">\n   <div class=\"ydo-live-volume-wrap\">\n    <button class=\"ydo-live-ctrl-btn\" aria-label=\"Ativar som\">♪</button>\n    <input type=\"range\" class=\"ydo-live-volume-slider\" value=\".5\" aria-label=\"Volume\">\n   </div>\n   <button class=\"ydo-live-edge-btn is-live\"><span class=\"ydo-live-dot-inner\"></span><span>AO VIVO</span></button>\n   <button class=\"ydo-live-latency-btn is-fast\"><span>Menor atraso</span></button>\n  </div>\n  <div class=\"ydo-live-controls-right\">\n   <div class=\"ydo-live-source-selector\">\n    <button class=\"ydo-live-source-pill\" aria-label=\"Selecionar servidor ou qualidade\"><span>HD — transmissão Full HD com nome longo</span></button>\n   </div>\n   <div class=\"zang-cast-control\">\n    <button class=\"ydo-live-ctrl-btn zang-cast-trigger\" aria-label=\"Transmitir para a TV\">◫<span>Transmitir</span></button>\n   </div>\n   <button class=\"ydo-live-ctrl-btn\" aria-label=\"Picture-in-Picture\">□</button>\n   <button class=\"ydo-live-ctrl-btn\" aria-label=\"Tela cheia\">⛶</button>\n  </div>\n </div>\n</div>";
 await send("Page.enable");
 await send("Runtime.enable");
 await send("Network.enable");
 await send("Emulation.setDeviceMetricsOverride",{width:1600,height:920,deviceScaleFactor:1,mobile:false});
 await send("Page.navigate",{url:BASE+"/tv"});
 await until("document.readyState==='complete' && !!document.querySelector('.ztv-studio')","TV CSS hydration");
 await evaluate("document.body.insertAdjacentHTML('beforeend',"+
   JSON.stringify('<section id="zf-player-layout-test" class="ztv-player-frame" style="position:fixed;top:10px;left:0;z-index:9999;background:#111"></section>')+")");
 await evaluate("document.getElementById('zf-player-layout-test').innerHTML = "+JSON.stringify(FIXTURE)+";");
 await until("getComputedStyle(document.querySelector('#zf-player-layout-test .ydo-live-controls-bar')).display==='grid'","controls grid CSS");
 for(const [width,density] of [[1266,"roomy"],[850,"compact"],[620,"compact"],[390,"minimal"]]){
  await send("Emulation.setDeviceMetricsOverride",{width:Math.max(width,400),height:920,deviceScaleFactor:1,mobile:width<500});
  const target="#zf-player-layout-test";
  await evaluate("(function(){ const f=document.getElementById('zf-player-layout-test'); f.style.width="+JSON.stringify(String(width)+"px")+
    "; f.querySelector('.ydo-live-player-container').dataset.controlsDensity="+JSON.stringify(density)+"; })()");
  await sleep(170);
  const result=await evaluate("(()=>{\n   const root=document.querySelector('#zf-player-layout-test');\n   const bar=root.querySelector('.ydo-live-controls-bar');\n   const br=bar.getBoundingClientRect();\n   const groups=[...root.querySelectorAll('.ydo-live-controls-left,.ydo-live-controls-right')];\n   const visible=(node)=>{const r=node.getBoundingClientRect();return r.width>1&&r.height>1&&getComputedStyle(node).visibility!=='hidden';};\n   const bounds=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};\n   const buttons=groups.flatMap(g=>[...g.querySelectorAll('button')].filter(visible));\n   const sorted=[...buttons].sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);\n   let collisions=0;\n   for(let i=0;i<sorted.length;i++) for(let j=i+1;j<sorted.length;j++){\n     const a=sorted[i].getBoundingClientRect(),b=sorted[j].getBoundingClientRect();\n     if(a.right>b.left+0.9 && b.right>a.left+0.9 && a.bottom>b.top+1 && b.bottom>a.top+1)collisions++;\n   }\n   return {density:root.querySelector('.ydo-live-player-container').dataset.controlsDensity,\n     barWidth:br.width,buttons:buttons.map(n=>({name:n.getAttribute('aria-label')||n.textContent.trim(),...bounds(n)})),\n     collisions,outside:buttons.filter(n=>{const r=n.getBoundingClientRect();return r.left<br.left-1||r.right>br.right+1;}).length};\n  })()");
  console.log(JSON.stringify({event:"live-controls-layout",width,...result}));
  if(result.collisions>0 || result.outside>0 || result.buttons.length<3){
   throw Error("Live player control overlap at "+width+"px: "+JSON.stringify(result));
  }
 }
}finally{
 socket?.close();
 chrome?.kill("SIGTERM");
 worker.kill("SIGTERM");
 rmSync(temp,{recursive:true,force:true});
}
