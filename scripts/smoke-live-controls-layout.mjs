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

const FIXTURE="\n<div class=\"ydo-live-player-container\" data-controls-visible=\"true\" style=\"width:100%;height:300px;position:relative;background:#0b1520\">\n  <div class=\"zf-player-toolbar is-visible\" role=\"toolbar\" aria-label=\"Controles da TV ao vivo\">\n    <div class=\"zf-player-tools-start\">\n      <button type=\"button\" class=\"zf-player-action\" aria-label=\"Ativar som\"><svg viewBox=\"0 0 20 20\"><path d=\"M1 2h7\"></path></svg></button>\n      <button type=\"button\" class=\"zf-player-live is-live\" aria-label=\"Ao vivo\"><span class=\"zf-player-live-dot\"></span><span class=\"zf-player-live-text\">AO VIVO</span></button>\n    </div>\n    <div class=\"zf-player-tools-end\">\n      <div class=\"zf-player-settings\">\n        <button class=\"zf-player-action\" aria-label=\"Qualidade e ajustes de reprodução\" aria-expanded=\"false\"><svg viewBox=\"0 0 20 20\"></svg></button>\n      </div>\n      <div class=\"zang-cast-control\"><button type=\"button\" class=\"zf-player-action zang-cast-trigger\" aria-label=\"Transmitir para a TV\"><svg viewBox=\"0 0 20 20\"></svg></button></div>\n      <button type=\"button\" class=\"zf-player-action\" aria-label=\"Assistir em tela cheia\"><svg viewBox=\"0 0 20 20\"></svg></button>\n    </div>\n  </div>\n</div>";
 await send("Page.enable");
 await send("Runtime.enable");
 await send("Network.enable");
 await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send("Page.navigate",{url:BASE+"/tv"});
 await until("document.readyState==='complete' && !!document.querySelector('.ztv-studio')","TV route and CSS");
 await evaluate("document.body.insertAdjacentHTML('beforeend',"+JSON.stringify('<section id="zf-player-layout-test" class="ztv-player-frame" style="position:fixed;top:10px;left:0;z-index:9999;width:390px;background:#111"></section>')+")");
 await evaluate("document.getElementById('zf-player-layout-test').innerHTML = "+JSON.stringify(FIXTURE));
 await until("getComputedStyle(document.querySelector('#zf-player-layout-test .zf-player-toolbar')).display==='flex'","minimal controls CSS");
 for(const width of [280,320,360,390,620,850,1266]){
  await send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await evaluate("document.getElementById('zf-player-layout-test').style.width="+JSON.stringify(width+"px"));
  await sleep(180);
  const result=await evaluate("(()=>{\n const root=document.getElementById(\"zf-player-layout-test\");\n const bar=root.querySelector(\".zf-player-toolbar\");\n const br=bar.getBoundingClientRect();\n const groups=[...root.querySelectorAll(\".zf-player-tools-start,.zf-player-tools-end\")];\n const visible=node=>{const r=node.getBoundingClientRect();return r.width>1&&r.height>1&&getComputedStyle(node).display!==\"none\";};\n const buttons=groups.flatMap(group=>[...group.querySelectorAll(\"button\")].filter(visible));\n const rects=buttons.map(node=>{const r=node.getBoundingClientRect();return {name:node.getAttribute(\"aria-label\"),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};});\n let collisions=0;\n for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){\n  const a=rects[i],b=rects[j];\n  if(a.right>b.left+.9&&b.right>a.left+.9&&a.bottom>b.top+1&&b.bottom>a.top+1) collisions++;\n }\n return {barWidth:br.width, buttons:rects,collisions,\n   outside:rects.filter(r=>r.left<br.left-1||r.right>br.right+1).length,\n   distinctGroups:groups.length,barDisplay:getComputedStyle(bar).display};\n})()");
  console.log(JSON.stringify({event:"live-controls-layout",width,...result}));
  if(result.collisions!==0||result.outside!==0||result.distinctGroups!==2||result.buttons.length!==5||result.barDisplay!=="flex"){
   throw Error("Controls overlap or disappear at "+width+"px: "+JSON.stringify(result));
  }
  if([320,390,850].includes(width)){
   await evaluate("document.querySelector('#zf-player-layout-test .zf-player-settings').insertAdjacentHTML('beforeend',"+JSON.stringify("<div class=\"zf-player-menu\" role=\"dialog\"><div class=\"zf-player-menu-header\">Ajustes do player</div><label class=\"zf-player-volume-control\"><span>Volume</span><input type=\"range\" value=\".7\"></label><button class=\"zf-player-menu-option\">Menor atraso</button><button class=\"zf-player-menu-option\">Janela flutuante</button><div class=\"zf-player-menu-subtitle\">Servidores e qualidade</div><button class=\"zf-player-menu-option\"><span class=\"zf-player-menu-server\">Servidor HD com nome muito extenso e grandes detalhes</span><span class=\"zf-player-menu-hint\">FHD</span></button></div>")+")");
   await sleep(80);
   const menu=await evaluate("(()=>{\n const root=document.getElementById(\"zf-player-layout-test\");\n const menu=root.querySelector(\".zf-player-menu\");\n const r=menu.getBoundingClientRect(), frame=root.getBoundingClientRect();\n return {left:r.left,right:r.right,width:r.width,frameRight:frame.right,\n  overflowX:getComputedStyle(menu).overflowX,display:getComputedStyle(menu).display};\n})()");
   console.log(JSON.stringify({event:"live-controls-settings",width,...menu}));
   if(menu.display!=="flex"||menu.left< -1||menu.right>width+1){
    throw Error("Settings popup outside the video at "+width+"px: "+JSON.stringify(menu));
   }
   await evaluate("document.querySelector('#zf-player-layout-test .zf-player-menu').remove()");
  }
 }
 // Confirm the real LivePlayer component also mounts the new toolbar, not just
 // the geometry fixture. Channel availability is tested by separate workflows.
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send("Page.navigate",{url:BASE+"/tv/canal/band"});
 await until("!!document.querySelector('.ztv-player-frame .zf-player-toolbar')","real LivePlayer toolbar");
 const live=await evaluate("({icons:document.querySelectorAll('.ztv-player-frame .zf-player-toolbar button').length,legacy:document.querySelectorAll('.ztv-player-frame .ydo-live-controls-bar').length,fullscreen:!!document.querySelector('.ztv-player-frame .zf-player-toolbar button[aria-label=\\"Assistir em tela cheia\\"]')})");
 console.log(JSON.stringify({event:"real-live-player-toolbar",...live}));
 if(live.icons<4||live.legacy!==0||!live.fullscreen) throw Error("Real LivePlayer does not use isolated minimal toolbar");
}finally{
 socket?.close();
 chrome?.kill("SIGTERM");
 worker.kill("SIGTERM");
 rmSync(temp,{recursive:true,force:true});
}
