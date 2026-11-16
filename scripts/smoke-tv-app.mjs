// Real Chrome TV app UX smoke: viewport, brand assets, remote keys and screenshots.
import {spawn,spawnSync} from "node:child_process";
import {existsSync,readFileSync,mkdtempSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const cmd=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync("which",[x]).status===0);
if(!cmd)throw Error("Chrome not installed");
const BASE="http://127.0.0.1:4231";
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local","--ip","127.0.0.1","--port","4231"],{stdio:["ignore","pipe","pipe"]});
let workerLog="",chrome,ws,seq=0;
const pending=new Map();
for(const s of [worker.stdout,worker.stderr])s.on("data",d=>workerLog=(workerLog+String(d)).slice(-2600));
function call(method,params={}){
 const id=++seq;
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error(method+" timed out"));},25000);
  pending.set(id,{resolve,reject,timeout});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails).slice(0,600));
 return r.result?.value;
}
const state=()=>evaluate('(()=>{const cards=[...document.querySelectorAll("[data-tv-device]")];const hero=document.querySelector(".zf-tv-premium-hero");return {width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector("#zf-tv-hero-title")?.textContent,cards:cards.length,selected:document.querySelector("[data-tv-device].is-selected")?.dataset.tvDevice,panel:document.querySelector("#zf-tv-install-panel")?.innerText?.slice(0,220),visual:!!document.querySelector(".zf-tv-hardware"),logos:cards.map(c=>({id:c.dataset.tvDevice,loaded:c.querySelector("img")?.naturalWidth||0})),heroWidth:hero?.getBoundingClientRect().width}})()');
try {
 let online=false;
 for(let n=0;n<95;n++){
  if(worker.exitCode!==null)throw Error("Local worker crashed: "+workerLog);
  try{const r=await fetch(BASE+"/tv-app",{signal:AbortSignal.timeout(1200)});if(r.ok){online=true;break;}}catch{}
  await wait(320);
 }
 if(!online)throw Error("TV page failed to start: "+workerLog);
 const profile=mkdtempSync(join(tmpdir(),"zf-tvapp-chrome-"));
 chrome=spawn(cmd,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--remote-allow-origins=*","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:"ignore"});
 const portFile=join(profile,"DevToolsActivePort");
 for(let n=0;n<100&&!existsSync(portFile);n++)await wait(140);
 if(!existsSync(portFile))throw Error("Could not start Chrome");
 const port=Number(readFileSync(portFile,"utf8").split("\n")[0]);
 const targets=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 ws=new WebSocket(targets.find(x=>x.type==="page").webSocketDebuggerUrl);
 ws.addEventListener("message",e=>{
  const r=JSON.parse(e.data),p=pending.get(r.id);
  if(!p)return;
  clearTimeout(p.timeout);pending.delete(r.id);
  r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);
 });
 await new Promise(resolve=>ws.addEventListener("open",resolve,{once:true}));
 await call("Page.enable");await call("Runtime.enable");
 mkdirSync("artifacts",{recursive:true});
 for(const d of [{name:"desktop",width:1440,height:900,mobile:false},{name:"mobile",width:390,height:844,mobile:true}]){
  await call("Emulation.setDeviceMetricsOverride",{width:d.width,height:d.height,mobile:d.mobile,deviceScaleFactor:1});
  await call("Page.navigate",{url:BASE+"/tv-app"});
  let first;
  for(let n=0;n<110;n++){
   first=await state().catch(()=>({}));
   if(first.cards===4&&first.visual&&first.title)break;
   await wait(170);
  }
  if(first.cards!==4||!first.visual||first.scroll>d.width+2)throw Error(d.name+" missing hero or horizontal overflow: "+JSON.stringify(first));
  if(first.logos.some(x=>x.id!=="tcl-android"&&x.loaded===0))throw Error(d.name+" local logos failed: "+JSON.stringify(first.logos));
  await evaluate('document.querySelector("[data-tv-device=tcl-android]").focus()');
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
  await call("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
  await wait(150);
  const samsung=await state();
  if(samsung.selected!=="samsung"||!samsung.panel?.includes("Samsung Smart TV"))throw Error("Remote focus/selection failed: "+JSON.stringify(samsung));
  await evaluate('document.querySelector("[data-tv-device=lg]").click()');
  await wait(160);
  const lg=await state();
  if(lg.selected!=="lg"||!lg.panel?.includes("LG Smart TV")||lg.scroll>d.width+2)throw Error("LG panel/layout failed: "+JSON.stringify(lg));
  const shot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  writeFileSync("artifacts/tv-app-"+d.name+".png",Buffer.from(shot.data,"base64"));
  console.log(JSON.stringify({event:"tv-app-visual",device:d.name,logoCount:first.logos.length,selected:lg.selected,overflow:lg.scroll-d.width,screenshot:"artifacts/tv-app-"+d.name+".png"}));
 }
} finally {
 try{ws?.close()}catch{}
 try{chrome?.kill("SIGTERM")}catch{}
 try{worker.kill("SIGTERM")}catch{}
}
