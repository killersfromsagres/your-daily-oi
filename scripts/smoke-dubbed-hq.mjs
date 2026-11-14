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
const bundle=await Bun.build({entrypoints:['scripts/fixtures/dubbed-hq-harness.tsx'],bundle:true,target:'browser',format:'esm',write:false,define:{'process.env.NODE_ENV':'"production"'}});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const js=await bundle.outputs[0].text();
const css=['src/styles.css','src/styles/player.css','src/styles/player-fullscreen.css','src/styles/server-selector.css'].map(p=>readFileSync(p,'utf8')).join('\n');
const server=Bun.serve({hostname:'127.0.0.1',port:4214,fetch(request){
 const url=new URL(request.url);
 let path=url.pathname;
 if(path.startsWith('/vendor/websr/')||path.startsWith('/models/websr/')){
  try{return new Response(readFileSync('public'+path),{headers:{'Content-Type':path.endsWith('.js')?'text/javascript':'application/json'}});}catch{return new Response('',{status:404});}
 }
 if(path==='/entry.js')return new Response(js,{headers:{'Content-Type':'text/javascript'}});
 if(path==='/api/live-proxy')path=new URL(url.searchParams.get('url'),'http://127.0.0.1:4214').pathname;
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
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
const state=()=>evaluate("(()=>{const v=document.querySelector('video'),hq=document.querySelector('.ydo-hq-btn');return {time:v?.currentTime||0,paused:v?.paused,src:v?.currentSrc,hq:hq?.getAttribute('aria-pressed'),mode:hq?.dataset.mode,notice:document.body.innerText.includes('Dublagem indisponível'),sources:Array.from(document.querySelectorAll('.zf-server-audio')).map(x=>x.textContent),width:innerWidth,bodyWidth:document.documentElement.scrollWidth};})()");
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
 for(const scenario of [{mode:'movie',width:1440,height:900,mobile:false},{mode:'series',width:390,height:844,mobile:true},{mode:'anime',width:390,height:844,mobile:true}]){
  await send('Emulation.setDeviceMetricsOverride',{width:scenario.width,height:scenario.height,mobile:scenario.mobile,deviceScaleFactor:1});
  await send('Emulation.setUserAgentOverride',{userAgent:scenario.mobile?'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'});
  await send('Page.navigate',{url:'http://127.0.0.1:4214/?mode='+scenario.mode});
  const playing=await until(s=>s.time>1&&!s.paused);
  if(!playing.src?.includes('good-dub-720p'))throw Error('Wrong fallback source: '+JSON.stringify(playing));
  if(playing.bodyWidth>scenario.width+1)throw Error('Player overflows viewport');
  await evaluate("document.querySelector('.ydo-hq-btn').click()");
  const enhanced=await until(s=>s.hq==='true'&&s.time>playing.time+.5&&s.mode!=='loading');
  if(enhanced.src!==playing.src)throw Error('HQ restarted or changed the media');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:100,y:100});
  const shot=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync('artifacts/dubbed-hq-'+scenario.mode+'.png',Buffer.from(shot.data,'base64'));
  await evaluate("document.querySelector('.ydo-hq-btn').click()");
  await until(s=>s.hq==='false'&&s.time>enhanced.time&&!s.paused);
  console.log(JSON.stringify({event:'dubbed-hq-playback',scenario:scenario.mode,playing,enhanced}));
 }
 await send('Page.navigate',{url:'http://127.0.0.1:4214/?mode=leg-only'});
 const blocked=await until(s=>s.notice);
 if(blocked.src||requests.some(path=>path.includes('must-never')))throw Error('A subtitle-only source was requested');
 if(!requests.some(path=>path.includes('broken-dub')))throw Error('Failure recovery was not exercised');
 console.log(JSON.stringify({event:'dubbed-only-empty',blocked,foreignMediaRequests:0}));
}finally{ws?.close();chrome?.kill('SIGTERM');server.stop(true);}
