// Exercise the production VOD player using a generated, non-copyrighted test clip.
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const folder=mkdtempSync(join(tmpdir(),'zf-dub-hq-')),media=join(folder,'clip.mp4');
const generated=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','65','-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',media],{encoding:'utf8'});
if(generated.status!==0)throw Error('Test clip generation failed: '+(generated.error?.message||generated.stderr));
const video=readFileSync(media),requests=[];
const bundle=await Bun.build({entrypoints:['scripts/fixtures/tv-experience-harness.tsx'],bundle:true,target:'browser',format:'esm',write:false,define:{'process.env.NODE_ENV':'"production"'}});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const js=await bundle.outputs[0].text();
const css=['src/styles.css','src/styles/player.css','src/styles/player-fullscreen.css','src/styles/server-selector.css','src/styles/tv.css','src/styles/adaptive-navigation.css','src/styles/live-controls-minimal.css','src/styles/tv-experience.css'].map(p=>readFileSync(p,'utf8')).join('\n');
const server=Bun.serve({hostname:'127.0.0.1',port:4216,fetch(request){
 const url=new URL(request.url);
 let path=url.pathname;
 if(path.startsWith('/vendor/websr/')||path.startsWith('/models/websr/')){
  try{return new Response(readFileSync('public'+path),{headers:{'Content-Type':path.endsWith('.js')?'text/javascript':'application/json'}});}catch{return new Response('',{status:404});}
 }
 if(path==='/entry.js')return new Response(js,{headers:{'Content-Type':'text/javascript'}});
 if(path==='/api/tv/stream')path='/media/good-dub-720p.mp4';
 if(path==='/api/live-proxy')path=new URL(url.searchParams.get('url'),'http://127.0.0.1:4216').pathname;
 if(path.startsWith('/media/')){
  requests.push(path);
  if(path!=='/media/good-dub-720p.mp4')return new Response('Unavailable',{status:503});
  const range=/bytes=(\d+)-(\d*)/.exec(request.headers.get('range')||'');
  const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),video.length-1):video.length-1;
  return new Response(video.subarray(start,end+1),{status:range?206:200,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(range?{'Content-Range':'bytes '+start+'-'+end+'/'+video.length}:{})}});
 }
 return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0}#root{position:fixed;inset:0}</style><div id="root"></div><script type="module" src="/entry.js"></script>',{headers:{'Content-Type':'text/html'}});
}});
const bin=['google-chrome','google-chrome-stable','chromium','chromium-browser'].find(x=>spawnSync('which',[x]).status===0);
if(!bin)throw Error('Chrome required');
let chrome,ws,seq=0;const pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++seq,timeout=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},20000);
 pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
const state=()=>evaluate("(()=>{const v=document.querySelector('video');return {time:v?.currentTime||0,paused:v?.paused,volume:v?.volume,muted:v?.muted,controls:document.querySelector('.ydo-live-player-container')?.dataset.controlsVisible,panel:!!document.querySelector('.zf-volume-panel'),fullscreen:!!document.fullscreenElement||!!document.querySelector('.ydo-live-player-container.is-theater'),nativeFullscreen:!!document.fullscreenElement,switches:document.querySelector('[data-channel-switches]')?.textContent,focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent,bodyWidth:document.documentElement.scrollWidth,width:innerWidth};})()");
const until=async fn=>{for(let n=0;n<400;n++){const s=await state().catch(()=>({}));if(fn(s))return s;await sleep(150);}throw Error('Player state timeout: '+JSON.stringify(await state()));};
try{
 let port=0,logs='';
 for(let attempt=0;attempt<3&&!port;attempt++){
  const profile=mkdtempSync(join(tmpdir(),'zf-dub-chrome-'));
  chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--no-first-run','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','pipe','pipe']});
  for(const st of [chrome.stdout,chrome.stderr])st.on('data',d=>logs=(logs+String(d)).slice(-2000));
  const file=join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!existsSync(file)&&chrome.exitCode===null;i++)await sleep(120);
  if(existsSync(file)){port=Number(readFileSync(file,'utf8').split('\n')[0]);break;}
  chrome.kill('SIGTERM');await sleep(400);
 }
 if(!port)throw Error('Chrome startup failed: '+logs);
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 ws.addEventListener('message',event=>{const r=JSON.parse(event.data),p=pending.get(r.id);if(!p)return;clearTimeout(p.timeout);pending.delete(r.id);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);});
 await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'hardwareConcurrency',{value:8});Object.defineProperty(navigator,'deviceMemory',{value:8});"});
 mkdirSync('artifacts',{recursive:true});
 for(const scenario of [{mode:'tv',width:1440,height:900,mobile:false},{mode:'mobile',width:390,height:844,mobile:true}]){
  await send('Emulation.setDeviceMetricsOverride',{width:scenario.width,height:scenario.height,mobile:scenario.mobile,deviceScaleFactor:1});
  await send('Page.navigate',{url:'http://127.0.0.1:4216/?mode='+scenario.mode});
  const playing=await until(s=>s.time>1&&!s.paused);
  if(playing.bodyWidth>scenario.width+1||Math.abs(playing.volume-.6)>.02)throw Error('Initial audio/layout failed: '+JSON.stringify(playing));
  await evaluate("document.querySelector('[aria-label=\"Ajustar volume\"]').click()");
  await until(s=>s.panel);
  if(playing.muted){await evaluate("document.querySelector('.zf-volume-mute').click()");await until(s=>!s.muted&&Math.abs(s.volume-.6)<.01);}
  await evaluate("document.querySelector('[aria-label=\"Diminuir volume\"]').click()");
  await until(s=>Math.abs(s.volume-.55)<.01);console.log(JSON.stringify({step:'volume-decreased',state:await state()}));
  await evaluate("document.querySelector('[aria-label=\"Aumentar volume\"]').click()");
  await until(s=>Math.abs(s.volume-.6)<.01);
  await evaluate("document.querySelector('.zf-volume-mute').click()");await until(s=>s.muted);
  await evaluate("document.querySelector('.zf-volume-mute').click()");await until(s=>!s.muted&&Math.abs(s.volume-.6)<.01);
  // Samsung Back closes the audio panel rather than navigating out of the channel.
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Unidentified',windowsVirtualKeyCode:10009,nativeVirtualKeyCode:10009});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Unidentified',windowsVirtualKeyCode:10009,nativeVirtualKeyCode:10009});
  await until(s=>!s.panel);console.log(JSON.stringify({step:'remote-back-closed-volume',state:await state()}));
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Trocar canal').click()");
  await until(s=>s.time>1&&!s.paused&&Math.abs(s.volume-.6)<.01);console.log(JSON.stringify({step:'channel-volume-restored',state:await state()}));
  if(!scenario.mobile){
   await evaluate("document.querySelector('[aria-label=\"Assistir em tela cheia\"]').click()");await until(s=>s.fullscreen);console.log(JSON.stringify({step:'fullscreen-entered',state:await state()}));
   await evaluate("document.querySelector('[aria-label=\"Ajustar volume\"]').focus()");
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
   const first=await state();
   if(first.focus==='Ajustar volume'){
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
   }
   const focused=await until(s=>s.focus==='Ao vivo'||s.focus==='Voltar para o ao vivo');
   if(focused.switches!=='0')throw Error('D-pad navigation changed channels');
   await evaluate("document.querySelector('[aria-label=\"Sair da tela cheia\"]').click()");await until(s=>!s.fullscreen);
  }
  await evaluate("document.querySelector('[aria-label=\"Ajustar volume\"]').click()");await until(s=>s.panel);
  const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync('artifacts/live-tv-'+scenario.mode+'.png',Buffer.from(shot.data,'base64'));
  console.log(JSON.stringify({event:'live-tv-volume-remote',scenario:scenario.mode,playing,final:await state()}));
 }
}finally{ws?.close();chrome?.kill('SIGTERM');server.stop(true);}
