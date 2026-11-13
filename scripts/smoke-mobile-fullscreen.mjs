// CI browser verification of the production fullscreen hook and stylesheet.
import {spawn,spawnSync} from "node:child_process";
import {readFileSync,mkdtempSync,existsSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const build=await Bun.build({entrypoints:["scripts/fixtures/fullscreen-harness.tsx"],bundle:true,target:"browser",format:"esm",write:false,define:{"process.env.NODE_ENV":"\"production\""}});
if(!build.success)throw new Error(build.logs.join("\n"));
const js=await build.outputs[0].text();
const css=["src/styles/player.css","src/styles/player-fullscreen.css"].map(p=>readFileSync(p,"utf8")).join("\n");
const server=Bun.serve({hostname:"127.0.0.1",port:4210,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==="/entry.js")return new Response(js,{headers:{"Content-Type":"text/javascript"}});
 return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#090b12}#root{width:100%;height:260px}'+css+'</style><div id="root"></div><script type="module" src="/entry.js"></script>',{headers:{"Content-Type":"text/html"}});
}});
const bin=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(x=>spawnSync("which",[x]).status===0);
if(!bin)throw new Error("Chrome is required");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome;
let ws,seq=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++seq,timeout=setTimeout(()=>{pending.delete(id);reject(Error(method+" timeout"));},15000);
 pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{
 const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value;
};
const state=()=>evaluate(`(()=>{
 const p=document.querySelector('#player'),s=p?.querySelector('.zf-fullscreen-surface');
 return {active:p?.dataset.fullscreen==='true',native:!!document.fullscreenElement,theater:p?.classList.contains('is-theater'),
 rotated:p?.classList.contains('is-landscape-fallback'),width:s?.clientWidth,height:s?.clientHeight,transform:s&&getComputedStyle(s).transform,
 locks:window.__locks||0,unlocks:window.__unlocks||0,nativeAtLock:window.__nativeAtLock,overflow:document.body.style.overflow};
})()`);
const until=async fn=>{for(let i=0;i<70;i++){const s=await state();if(fn(s))return s;await sleep(100);}throw Error('Fullscreen state timeout: '+JSON.stringify(await state()));};
const click=async()=>{
 const point=await evaluate(`(()=>{const r=document.querySelector('#expand').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...point});
 await send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...point});
};
const viewport=async landscape=>send("Emulation.setDeviceMetricsOverride",{width:landscape?844:390,height:landscape?390:844,deviceScaleFactor:1,mobile:true});
try{
 let port=0,chromeLog="";
 for(let attempt=0;attempt<3&&!port;attempt++){
  const profile=mkdtempSync(join(tmpdir(),"zf-fullscreen-"));
  chrome=spawn(bin,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
   "--disable-background-networking","--disable-extensions","--no-default-browser-check","--no-first-run",
   "--remote-allow-origins=*","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","pipe","pipe"]});
  for(const stream of [chrome.stdout,chrome.stderr])stream.on('data',data=>chromeLog=(chromeLog+String(data)).slice(-2500));
  const portfile=join(profile,"DevToolsActivePort");
  for(let i=0;i<100&&!existsSync(portfile)&&chrome.exitCode===null;i++)await sleep(120);
  if(existsSync(portfile)){port=Number(readFileSync(portfile,"utf8").split("\n")[0]);break;}
  chrome.kill('SIGTERM');await sleep(400);
 }
 if(!port)throw Error('Chrome could not start: '+chromeLog);
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 ws.addEventListener("message",event=>{const r=JSON.parse(event.data),p=pending.get(r.id);if(!p)return;clearTimeout(p.timeout);pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);});
 await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
 const mode=new URL(location.href).searchParams.get('mode');window.__locks=0;window.__unlocks=0;
 Object.defineProperty(screen.orientation,'lock',{configurable:true,value:()=>{
   window.__locks++;window.__nativeAtLock=!!document.fullscreenElement;
   if(mode==='allow')return Promise.resolve();
   if(mode==='pending')return new Promise(resolve=>{window.__resolveOrientation=resolve});
   return Promise.reject(new Error('NotSupportedError'));
 }});
 Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>{window.__unlocks++}});
 if(mode==='noapi')for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,key,{configurable:true,value:undefined});
 })()`});
 mkdirSync('artifacts',{recursive:true});
 for(const mode of ['deny','allow','desktop','noapi','pending']){
  const desktop=mode==='desktop';
  await send('Emulation.setUserAgentOverride',{userAgent:desktop?'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'});
  if(desktop)await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});else await viewport(false);
  await send('Page.navigate',{url:'http://127.0.0.1:4210/?mode='+mode});
  await until(s=>s.width>0&&!s.active);await send('Page.bringToFront');await click();
  let opened=await until(s=>s.active&&(mode==='pending'?s.locks===1:mode==='allow'?s.locks===1:mode==='desktop'?true:s.rotated));
  if(desktop&&(opened.locks||opened.rotated))throw Error('Desktop orientation was changed');
  if(!desktop&&mode!=='noapi'&&!opened.nativeAtLock)throw Error('Orientation requested before fullscreen entry');
  if(mode==='deny'){
   if(!opened.native||Math.abs(opened.width-844)>2||Math.abs(opened.height-390)>2||opened.transform==='none')throw Error('Portrait fallback surface is incorrect: '+JSON.stringify(opened));
   await viewport(true);await until(s=>!s.rotated);await viewport(false);await until(s=>s.rotated);
  }
  if(mode==='allow'){await viewport(true);opened=await until(s=>!s.rotated&&s.width>s.height);}
  if(mode==='noapi'&&(!opened.theater||opened.native))throw Error('Missing inline fullscreen fallback');
  if(mode!=='pending'){
   const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync('artifacts/mobile-fullscreen-'+mode+'.png',Buffer.from(shot.data,'base64'));
  }
  await click();await until(s=>!s.active&&!s.native&&!s.theater&&!s.rotated);
  if(mode==='pending'){
   await evaluate('window.__resolveOrientation()');await until(s=>s.unlocks===1&&!s.active);
  }
  const closed=await state();
  if(mode==='allow'&&closed.unlocks!==1)throw Error('Orientation lock was not released');
  if(closed.overflow==='hidden')throw Error('Page scroll was not restored');
  console.log(JSON.stringify({event:'mobile-fullscreen',mode,opened,closed}));
 }
}finally{ws?.close();chrome?.kill('SIGTERM');server.stop(true);}
