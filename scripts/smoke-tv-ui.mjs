// scripts/smoke-tv-ui.mjs — Bun; headless Chrome UI smoke against the built Cloudflare Worker.
import { spawn, spawnSync } from "node:child_process";
const tools = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
let executable = "";
for(const name of tools){
 const r=spawnSync("which",[name],{encoding:"utf8"});
 if(r.status===0){executable=r.stdout.trim();break;}
}
if(!executable){
 console.warn("Headless browser not installed on this runner; Worker and UI bundle checks remain enabled.");
 process.exit(0);
}
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local","--ip","127.0.0.1","--port","4175"],{stdio:["ignore","pipe","pipe"]});
let logs="";
worker.stderr.on("data",chunk=>{logs=(logs+String(chunk)).slice(-3500)});
const BASE="http://127.0.0.1:4175";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;
 for(let i=0;i<40;i++){
  if(worker.exitCode!==null)throw new Error("Worker failed to launch: "+logs);
  try{
   const res=await fetch(BASE+"/api/version",{signal:AbortSignal.timeout(2500)});
   if(res.status===200){ready=true;break;}
  }catch{}
  await sleep(350);
 }
 if(!ready)throw new Error("Worker unavailable: "+logs);
 const result=spawnSync(executable,[
  "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
  "--disable-background-networking","--disable-extensions","--hide-scrollbars",
  "--virtual-time-budget=9000","--window-size=1440,1000","--dump-dom",BASE+"/tv"
 ],{encoding:"utf8",maxBuffer:12*1024*1024,timeout:30000});
 const html=result.stdout||"";
 const required=["ztv-studio","ztv-header","ztv-player-frame","ztv-quick","ztv-explore","ztv-channel-grid","ztv-guide-overlay"];
 const absent=required.filter(x=>!html.includes(x));
 // Drawer is closed on initial load: only its triggering button is present.
 const failures=absent.filter(x=>x!=="ztv-guide-overlay");
 const visibleChannels=(html.match(/class="ztv-card-main"/g)||[]).length;
 console.log(JSON.stringify({
   event:"browser-tv-ui",chrome:executable,status:result.status,htmlSize:html.length,
   channelCards:visibleChannels,requiredMissing:failures,
   hasSearch:html.includes("Buscar canais"),hasGuideButton:html.includes("Guia de programação"),
 }));
 if(result.status!==0 || failures.length || !html.includes("Buscar canais") || !html.includes("Guia de programação")){
   throw new Error("Rendered TV UI incomplete: "+(result.stderr||"").slice(-500));
 }
 const deepLink=spawnSync(executable,[
   "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
   "--disable-background-networking","--disable-extensions","--virtual-time-budget=7500",
   "--window-size=1440,1000","--dump-dom",BASE+"/tv/canal/band"
 ],{encoding:"utf8",maxBuffer:12*1024*1024,timeout:30000});
 const deepHtml=deepLink.stdout||"";
 const selectedBand=/class="ztv-now-copy"[\s\S]*?<h2>Band<\/h2>/.test(deepHtml);
 console.log(JSON.stringify({
   event:"browser-tv-deep-link",status:deepLink.status,selectedBand,
   cards:(deepHtml.match(/class="ztv-card-main"/g)||[]).length,
 }));
 if(deepLink.status!==0 || !selectedBand) throw new Error("Direct /tv/canal/band navigation failed");
} finally {
 worker.kill("SIGTERM");
}
