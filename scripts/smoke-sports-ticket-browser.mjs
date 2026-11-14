// scripts/smoke-sports-ticket-browser.mjs — Bun + Chrome CDP, mobile/desktop match cards and lineup modal.
import { spawn, spawnSync } from "node:child_process";
import { parseESPNLineups } from "../src/lib/football-lineups.ts";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT=4202,BASE="http://127.0.0.1:"+PORT;
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"]
 .find(name=>spawnSync("which",[name]).status===0);
if(!chrome)throw new Error("Chrome/Chromium needed for browser smoke");
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const server=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local","--ip","127.0.0.1","--port",String(PORT)],{stdio:["ignore","pipe","pipe"]});
let serverLog="";
for(const stream of [server.stdout,server.stderr])
 stream.on("data",data=>serverLog=(serverLog+String(data)).slice(-1800));
let browser,ws,seq=0;
const browserErrors=[];
const pending=new Map();
function send(method,params={}){
 const id=++seq;
 return new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>{pending.delete(id);reject(new Error(method+" timed out"));},20000);
  pending.set(id,{resolve,reject,deadline});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails).slice(0,500));
 return result.result?.value;
}
const STATE=`(()=>{
 const element=Array.from(document.querySelectorAll(".zf-ticket")).find(card=>card.querySelector(".zf-lineup-single-button")?.getAttribute("aria-label")==="Ver escalações de Moldova e Kazakhstan");
 const rect=element?.getBoundingClientRect();
 const styles=element&&getComputedStyle(element);
 const dialog=document.querySelector(".zf-lineup-dialog");
 const modalRect=dialog?.getBoundingClientRect();
 return {
  viewport:innerWidth,
  pathname:location.pathname,
  search:location.search,
  pageText:document.body?.innerText?.slice(0,420)||"",
  mockReady:!!window.__zfVisualMock,
  mockReads:window.__zfMockReads||[],
  cards:document.querySelectorAll(".zf-ticket").length,
  ticket:rect?{left:rect.left,right:rect.right,width:rect.width,height:rect.height}:null,
  ticketBg:styles?.backgroundColor||null,
  lineupButtons:element?.querySelectorAll(".zf-lineup-single-button").length||0,
  hasWatermark:!!element?.querySelector(".zf-ticket-watermark"),
  hasTeams:!!element?.querySelector(".zf-ticket-teams"),
  dialog:!!dialog,
  dialogRect:modalRect?{left:modalRect.left,right:modalRect.right,width:modalRect.width}:null,
  activeSide:dialog?.querySelector(".zf-lineup-switch button[aria-pressed=true]")?.textContent?.trim()||null,
  hasPitch:!!dialog?.querySelector(".zf-formation-pitch"),
  players:dialog?.querySelectorAll(".zf-formation-player").length||0,
  attackingGoal:!!dialog?.querySelector(".zf-formation-bottom-box"),
  title:dialog?.querySelector(".zf-lineup-dialog-club h2")?.textContent?.trim()||null,
  pending:!!dialog?.querySelector(".zf-lineup-message"),
 };
})()`;
async function waitFor(fn,attempts=110){
 for(let i=0;i<attempts;i++){
  const state=await evaluate(STATE).catch(()=>null);
  if(state && fn(state))return state;
  await sleep(230);
 }
 throw new Error("Timeout waiting for app state: "+JSON.stringify(await evaluate(STATE))+"; browser errors "+JSON.stringify(browserErrors.slice(-6))+"; worker "+serverLog);
}
async function screenshot(name){
 const result=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
 writeFileSync("artifacts/sports-ticket-"+name+".png",Buffer.from(result.data,"base64"));
}
try{
 let ready=false;
 for(let i=0;i<70;i++){
  if(server.exitCode!==null)throw new Error("Worker exited: "+serverLog);
  try{const response=await fetch(BASE+"/api/version",{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
  await sleep(300);
 }
 if(!ready)throw new Error("Worker not ready: "+serverLog);
 let port=0,chromiumLog="";
 for(let attempt=0;attempt<3&&!port;attempt++){
   const profile=mkdtempSync(join(tmpdir(),"zang-sport-"));
   browser=spawn(chrome,["--headless=new","--no-sandbox","--disable-dev-shm-usage",
    "--disable-gpu","--disable-background-networking","--disable-extensions",
    "--no-first-run","--no-default-browser-check",
    "--remote-allow-origins=*","--remote-debugging-port=0",
    "--user-data-dir="+profile,"--window-size=1440,900",BASE+"/futebol"],{stdio:["ignore","pipe","pipe"]});
   for(const output of [browser.stdout,browser.stderr])output.on("data",chunk=>{
     chromiumLog=(chromiumLog+String(chunk)).slice(-1100);
   });
   const portfile=join(profile,"DevToolsActivePort");
   for(let i=0;i<75&&!existsSync(portfile)&&browser.exitCode===null;i++)await sleep(150);
   if(existsSync(portfile)){
     port=Number(readFileSync(portfile,"utf8").split("\n")[0]);
     break;
   }
   browser.kill("SIGTERM");
   await sleep(600);
 }
 if(!port)throw new Error("Chrome port unavailable after three attempts: "+chromiumLog);
 const tabs=await (await fetch("http://127.0.0.1:"+port+"/json")).json();
 const tab=tabs.find(x=>x.type==="page");
 if(!tab)throw new Error("Chrome page target not found");
 ws=new WebSocket(tab.webSocketDebuggerUrl);
 ws.addEventListener("message",event=>{
  let message;try{message=JSON.parse(event.data);}catch{return;}
  if(message.method==="Runtime.exceptionThrown"){
    browserErrors.push(message.params?.exceptionDetails?.exception?.description||
      message.params?.exceptionDetails?.text||"Unknown browser exception");
  }
  if(message.method==="Runtime.consoleAPICalled"&&message.params?.type==="error"){
    browserErrors.push(message.params?.args?.map(a=>a.value||a.description||"").join(" ").slice(0,1200));
  }
  if(message.id===undefined)return;
  const request=pending.get(message.id);
  if(!request)return;
  clearTimeout(request.deadline);pending.delete(message.id);
  message.error?request.reject(new Error(JSON.stringify(message.error))):request.resolve(message.result||{});
 });
 await new Promise((resolve,reject)=>{
  if(ws.readyState===1){resolve();return;}
  ws.addEventListener("open",resolve,{once:true});
  ws.addEventListener("error",reject,{once:true});
 });
 await send("Runtime.enable");await send("Page.enable");
 // UI verification must not depend on third-party football coverage during
 // a GitHub CI run. Real API connectivity is independently checked in the
 // verify-football-production workflow. These fixtures are TEST ONLY.
 const parts=new Intl.DateTimeFormat("en-US",{
   timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
 }).formatToParts(new Date());
 const field=key=>parts.find(p=>p.type===key)?.value||"";
 const date=field("year")+"-"+field("month")+"-"+field("day");
 const first={
   id:"uefa.nations:401861162",casa:"Moldova",fora:"Kazakhstan",escudoCasa:null,escudoFora:null,
   horarioLocal:"07:15",inicioIso:new Date(Date.now()+60_000).toISOString(),
   dataLocal:date,rodada:"Amistoso",estadio:"Estádio Nacional",
   liga:"Amistosos de seleções",ligaId:"fifa.friendly",ligaLogo:null,grupo:"internacional",
   status:"agendado",placarCasa:null,placarFora:null,destaque:true,
   canalId:"globo",canalNome:"TV Globo",canalLogo:null,
   canaisDisponiveis:[{id:"globo",nome:"TV Globo"},{id:"sportv",nome:"SporTV"}],
   canaisTransmissao:["TV Globo","SporTV"],transmissao:"confirmada",
 };
 const second={...first,id:"fifa.friendly:99998",casa:"Argentina",fora:"França",
   horarioLocal:"18:30",canalId:null,canalNome:null,canaisDisponiveis:[],
   canaisTransmissao:[],transmissao:"nao-confirmada",destaque:false};
 const agenda={dataLocal:date,atualizadoEm:new Date().toISOString(),
   jogos:[first,second],parcial:false,fontesConsultadas:2,origem:"Visual mock"};
 const placares={...agenda,jogos:[]};
 // Recorded provider roles from the exact match that exposed the LB/CB swap.
 // Mock only transport; parser, vocabulary and rendered ordering are production code.
 const recorded=JSON.parse(readFileSync("tests/fixtures/espn-moldova-kazakhstan-lineups.json","utf8"));
 const lineup=parseESPNLineups(first.id,recorded);
 const mocks={"/api/jogos-agenda":agenda,"/api/jogos-placares":placares,
   "/api/jogos-escalacao":lineup,
   "/api/catalogo":{items:[],highlights:[],genres:[]}};
 await send("Page.addScriptToEvaluateOnNewDocument",{source:
   "(()=>{const original=window.fetch.bind(window);const mocks="+JSON.stringify(mocks)+
   ";window.__zfVisualMock=true;window.__zfMockReads=[];"+
   ";window.fetch=function(input,options){const value=String(input?.url||input);"+
   "let path;try{path=new URL(value,location.origin).pathname}catch{return original(input,options)}"+
   "const payload=mocks[path];if(payload){window.__zfMockReads.push(path);return Promise.resolve(new Response(JSON.stringify(payload),"+
   "{status:200,headers:{'Content-Type':'application/json'}}));}"+
   "return original(input,options);};})();"});
 mkdirSync("artifacts",{recursive:true});
 const cases=[
  {name:"android-small",width:320,height:780,mobile:true,
   ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
  {name:"android",width:390,height:844,mobile:true,
   ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
  {name:"desktop",width:1440,height:900,mobile:false,
   ua:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"},
 ];
 for(const device of cases){
  await send("Emulation.setDeviceMetricsOverride",{width:device.width,height:device.height,
   mobile:device.mobile,deviceScaleFactor:device.mobile?2:1});
  await send("Emulation.setUserAgentOverride",{userAgent:device.ua});
  await send("Page.navigate",{url:BASE+"/futebol"});
  const state=await waitFor(x=>x.cards>0 && x.lineupButtons===1 && x.ticket);
  if(!state.hasWatermark||!state.hasTeams)throw new Error("Missing ticket brand or team crests: "+JSON.stringify(state));
  if(state.ticket.left<0||state.ticket.right>device.width+1)throw new Error("Ticket overflows viewport: "+JSON.stringify(state));
  await evaluate('Array.from(document.querySelectorAll(".zf-ticket")).find(card=>card.querySelector(".zf-lineup-single-button")?.getAttribute("aria-label")==="Ver escalações de Moldova e Kazakhstan").scrollIntoView({block:"center"})');
  await sleep(600);
  await screenshot(device.name+"-ticket");
  if(device.mobile){
    await evaluate('window.scrollTo(0,400)');
    await sleep(150);
    const collapsed=await evaluate(`(()=>{
      const header=document.querySelector(".ydo-header");
      return {collapsed:header.classList.contains("is-mobile-collapsed"),
       width:header.getBoundingClientRect().width,
       logo:getComputedStyle(header.querySelector(".ydo-logo")).display,
       apk:getComputedStyle(header.querySelector(".zf-install-header")).display};
    })()`);
    if(!collapsed.collapsed||collapsed.width>47||collapsed.logo!=="none"||collapsed.apk!=="none")
      throw new Error("Mobile header did not collapse: "+JSON.stringify(collapsed));
    await screenshot(device.name+"-collapsed-search");
    await evaluate('document.querySelector(".ydo-search-trigger-btn").click()');
    await sleep(150);
    const search=await evaluate(`(()=>{
      const input=document.querySelector(".ydo-search-input"),form=input?.closest("form");
      const rect=form?.getBoundingClientRect();
      return {focused:document.activeElement===input,left:rect?.left,right:rect?.right};
    })()`);
    if(!search.focused||search.left<0||search.right>device.width+1)
      throw new Error("Collapsed search is inaccessible or overflows: "+JSON.stringify(search));
    await send("Input.insertText",{text:"Batman"});
    // Let React commit the controlled query before submitting the form. CDP
    // keyDown alone has no Enter character/default submission on some Chrome builds.
    await sleep(200);
    await evaluate('document.querySelector(".ydo-search-expand").requestSubmit()');
    await waitFor(x=>x.pathname==="/busca"&&x.search.includes("Batman"));
    await send("Page.navigate",{url:BASE+"/futebol"});
    await waitFor(x=>x.cards>0&&x.lineupButtons===1);
    await evaluate('window.scrollTo(0,0)');
    await sleep(150);
    const restored=await evaluate('document.querySelector(".ydo-header").classList.contains("is-mobile-collapsed")&&getComputedStyle(document.querySelector(".ydo-logo")).display==="none"');
    if(!restored)throw new Error("Mobile search must remain floating at the top");
  }else{
    const collapsed=await evaluate('document.querySelector(".ydo-header").classList.contains("is-mobile-collapsed")');
    if(collapsed)throw new Error("Desktop header must not collapse on scroll");
  }
  await evaluate('Array.from(document.querySelectorAll(".zf-lineup-single-button")).find(button=>button.getAttribute("aria-label")==="Ver escalações de Moldova e Kazakhstan").click()');
  const opened=await waitFor(x=>x.dialog && !!x.activeSide && x.players===11);
  if(opened.attackingGoal)throw new Error("Attacking goal marking is still present");
  const rows=await evaluate('Array.from(document.querySelectorAll(".zf-formation-row")).map(row=>row.children.length)');
  if(JSON.stringify(rows)!=="[1,5,3,2]")throw new Error("Incorrect formation rows: "+JSON.stringify(rows));
  const overlaps=await evaluate(`Array.from(document.querySelectorAll(".zf-formation-row")).some(row=>{
    const boxes=Array.from(row.children).map(player=>player.getBoundingClientRect());
    return boxes.some((box,index)=>index>0&&box.left<boxes[index-1].right-1);
  })`);
  if(overlaps)throw new Error("Player positions overlap on "+device.name);
  if(!opened.activeSide)throw new Error("Home lineup did not open");
  if(opened.dialogRect.left<-1||opened.dialogRect.right>device.width+1)throw new Error("Lineup modal overflows viewport: "+JSON.stringify(opened));
  const defensiveRoles=await evaluate('Array.from(document.querySelectorAll(".zf-formation-row")[1].children).map(player=>[player.dataset.playerId,player.dataset.position])');
  if(JSON.stringify(defensiveRoles)!=='[["272239","LE"],["365829","ZAG"],["326717","ZAG"],["293878","ZAG"],["276606","LD"]]')
    throw new Error("Moldova roles or lateral order wrong: "+JSON.stringify(defensiveRoles));
  await screenshot(device.name+"-lineup");
  await evaluate('document.querySelectorAll(".zf-lineup-switch button")[1].click()');
  const switched=await waitFor(x=>x.dialog && x.activeSide && x.activeSide!==opened.activeSide);
  const awayDefense=await evaluate('Array.from(document.querySelectorAll(".zf-formation-row")[1].children).map(player=>[player.dataset.playerId,player.dataset.position])');
  if(JSON.stringify(awayDefense)!=='[["402239","LE"],["272045","ZAG"],["237805","ZAG"],["320005","ZAG"],["326288","LD"]]')
    throw new Error("Kazakhstan roles or lateral order wrong: "+JSON.stringify(awayDefense));
  const awayAttack=await evaluate('Array.from(document.querySelectorAll(".zf-formation-row")[3].children).map(player=>player.dataset.position)');
  if(JSON.stringify(awayAttack)!=='["CA","CA"]')throw new Error("Central forwards mislabeled as wingers");
  await screenshot(device.name+"-kazakhstan-lineup");
  if(switched.activeSide===opened.activeSide)throw new Error("Team switch not working");
  await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await waitFor(x=>!x.dialog);
  console.log(JSON.stringify({event:"sports-ticket-chrome",device:device.name,cards:state.cards,
   ticketWidth:state.ticket.width,singleLineupButton:state.lineupButtons,
   modalWidth:opened.dialogRect.width,firstClub:opened.title,switchedClub:switched.title,
   pitchOrPending:opened.hasPitch||opened.pending,visualData:"synthetic fixtures, production checked separately"}));
 }
}finally{
 ws?.close();browser?.kill("SIGTERM");server.kill("SIGTERM");
}
