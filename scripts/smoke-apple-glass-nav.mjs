// scripts/smoke-apple-glass-nav.mjs — Bun + local Worker + Chrome CDP screenshots / computed glass assertions.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT=4199, BASE="http://127.0.0.1:"+PORT;
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"]
  .find(name=>spawnSync("which",[name]).status===0);
if(!chrome)throw new Error("Chrome/Chromium required for Apple glass visual smoke");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const worker=spawn("bunx",["wrangler@4","--cwd",".output","dev","--local",
  "--ip","127.0.0.1","--port",String(PORT)],{stdio:["ignore","pipe","pipe"]});
let workerLog="";
for(const st of [worker.stdout,worker.stderr])st.on("data",data=>workerLog=(workerLog+String(data)).slice(-2000));
let browser,ws,seq=0;
const pending=new Map();
function send(method,params={}){
  const id=++seq;
  return new Promise((resolve,reject)=>{
    const deadline=setTimeout(()=>{pending.delete(id);reject(new Error(method+" timed out"));},20000);
    pending.set(id,{resolve,reject,deadline});
    ws.send(JSON.stringify({id,method,params}));
  });
}
function evalInPage(expression){
  return send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})
    .then(res=>{
      if(res.exceptionDetails)throw new Error("Runtime evaluation failed: "+JSON.stringify(res.exceptionDetails).slice(0,450));
      return res.result?.value;
    });
}
const inspectExpression = `(() => {
  const info=selector=>{
    const node=document.querySelector(selector);
    if(!node)return null;
    const s=getComputedStyle(node);
    const rect=node.getBoundingClientRect();
    return {display:s.display,position:s.position,backdrop:s.backdropFilter||s.webkitBackdropFilter,
      background:s.backgroundColor,border:s.borderColor,
      left:rect.left,right:rect.right,width:rect.width,height:rect.height,
      parent:node.parentElement?.className||"",columns:s.gridTemplateColumns,
      alpha:(()=>{const c=s.backgroundColor.match(/[\\d.]+/g)||[];return c.length===4?Number(c[3]):1;})()};
  };
  return {width:innerWidth,platform:document.documentElement.dataset.zfPlatform,
    header:info(".ydo-header"),dock:info(".zf-mobile-dock"),
    search:info(".zf-mobile-search-fab"),active:info(".zf-mobile-tab.is-active"),
    links:[...document.querySelectorAll(".zf-mobile-tab")].map(el=>el.getAttribute("href")),
    dockSearchInside:!!document.querySelector(".zf-mobile-dock > .zf-mobile-search-fab"),
    navItemCount:document.querySelector(".zf-mobile-dock")?.children.length||0,
    accessibleTitles:[...document.querySelectorAll(".zf-mobile-dock > .zf-mobile-tab")]
      .map(el=>({title:el.title,label:el.textContent?.trim(),current:el.getAttribute("aria-current")})),
  };
})()`;
try{
  let live=false;
  for(let i=0;i<75;i++){
    if(worker.exitCode!==null)throw new Error("Worker stopped: "+workerLog);
    try{const res=await fetch(BASE+"/api/version",{signal:AbortSignal.timeout(1200)});
      if(res.ok){live=true;break;}
    }catch{}
    await sleep(350);
  }
  if(!live)throw new Error("Local site did not start: "+workerLog);
  const profile=mkdtempSync(join(tmpdir(),"zang-glass-"));
  browser=spawn(chrome,["--headless=new","--no-sandbox","--disable-dev-shm-usage",
    "--disable-background-networking","--disable-extensions",
    "--no-first-run","--no-default-browser-check",
    "--remote-allow-origins=*","--remote-debugging-port=0",
    "--user-data-dir="+profile,"--window-size=1440,900",BASE+"/"],{
      stdio:["ignore","pipe","pipe"],
    });
  const portFile=join(profile,"DevToolsActivePort");
  for(let i=0;i<85&&!existsSync(portFile);i++)await sleep(150);
  if(!existsSync(portFile))throw new Error("Chrome debugging port not available");
  const devtoolsPort=Number(readFileSync(portFile,"utf8").split("\n")[0]);
  const tabs=await (await fetch("http://127.0.0.1:"+devtoolsPort+"/json")).json();
  const tab=tabs.find(x=>x.type==="page");
  if(!tab)throw new Error("Chrome has no page target");
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener("message",event=>{
    let msg;
    try{msg=JSON.parse(event.data);}catch{return;}
    if(msg.id===undefined)return;
    const p=pending.get(msg.id);
    if(!p)return;
    clearTimeout(p.deadline);pending.delete(msg.id);
    if(msg.error)p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result||{});
  });
  await new Promise((resolve,reject)=>{
    if(ws.readyState===1){resolve();return;}
    ws.addEventListener("open",resolve,{once:true});
    ws.addEventListener("error",reject,{once:true});
  });
  await send("Page.enable");
  await send("Runtime.enable");
  mkdirSync("artifacts",{recursive:true});
  const cases=[
    {name:"mobile-320",width:320,height:720,mobile:true,ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
    {name:"mobile",width:390,height:844,mobile:true,ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
    {name:"mobile-430",width:430,height:932,mobile:true,ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
    {name:"mobile-landscape",width:844,height:390,mobile:true,ua:"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"},
    {name:"desktop",width:1440,height:900,mobile:false,ua:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"},
  ];
  for(const scenario of cases){
    await send("Emulation.setDeviceMetricsOverride",{width:scenario.width,height:scenario.height,
      deviceScaleFactor:scenario.mobile?2:1,mobile:scenario.mobile});
    await send("Emulation.setUserAgentOverride",{userAgent:scenario.ua});
    await send("Page.navigate",{url:BASE+"/"});
    let state;
    for(let i=0;i<60;i++){
      await sleep(250);
      try{state=await evalInPage(inspectExpression);
        if(state?.header&&state?.platform===(scenario.mobile?"mobile":"web")&&
          (!scenario.mobile||state.dock?.display!=="none"))break;}catch{}
    }
    if(!state?.header)throw new Error("Missing header in "+scenario.name);
    const inspect=(name,style)=>{
      if(!style)throw new Error("Missing "+name+" on "+scenario.name);
      if(!/blur\(/.test(style.backdrop||""))throw new Error(name+" has no backdrop blur: "+JSON.stringify(style));
      // Dark smoked glass should remain translucent: enough black tint to
      // avoid washed-out controls, but never a solid opaque backdrop.
      if(style.alpha<.39||style.alpha>.70)throw new Error(name+" is not translucent smoke glass (alpha "+style.alpha+")");
      if(!/brightness\(0\.(?:79|8|80|82)/.test(style.backdrop||""))throw new Error(name+" lacks darkened backdrop: "+style.backdrop);
    };
    inspect("header",state.header);
    if(scenario.mobile){
      inspect("dock",state.dock);
      if(!state.dockSearchInside||state.navItemCount!==6)
        throw new Error("Expected one unified capsule with 5 destinations and integrated search");
      if(state.search?.position==="fixed"||state.search?.parent!=="zf-mobile-dock")
        throw new Error("Search button must be inside the dock, not detached: "+JSON.stringify(state.search));
      if(state.search.left<state.dock.left-1||state.search.right>state.dock.right+1)
        throw new Error("Search control extends outside capsule: "+JSON.stringify(state.search));
      if(state.dock.left<0||state.dock.right>scenario.width+1)
        throw new Error("Dock out of viewport: "+JSON.stringify(state.dock));
      if(state.header.left<0||state.header.right>scenario.width+1)
        throw new Error("Header out of viewport: "+JSON.stringify(state.header));
      if(state.links.length!==5)throw new Error("Expected five catalogue destinations");
      if(!state.accessibleTitles.every(link=>link.title&&link.label))
        throw new Error("Missing accessible labels on icon-only tabs");
      if(!state.active||state.active.height<43)
        throw new Error("Active capsule has insufficient touch target");
    }
    const screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
    writeFileSync("artifacts/apple-glass-"+scenario.name+".png",Buffer.from(screenshot.data,"base64"));
    if(scenario.name==="mobile"){
      // Verify the integrated search still opens the functional catalogue drawer
      // after moving its button into the six-slot navigation capsule.
      await evalInPage('document.querySelector(".zf-mobile-dock > .zf-mobile-search-fab").click()');
      let opened=false;
      for(let tries=0;tries<28;tries++){
        opened=Boolean(await evalInPage('!!document.querySelector(".zf-mobile-menu-panel") && !!document.querySelector(".zf-mobile-menu-panel input[type=search]")'));
        if(opened)break;
        await sleep(180);
      }
      if(!opened)throw new Error("Integrated search failed to open the catalogue drawer");
      await evalInPage('document.querySelector(".zf-mobile-menu-close").click()');
      for(let tries=0;tries<28;tries++){
        const closed=await evalInPage('!document.querySelector(".zf-mobile-menu-panel")');
        if(closed)break;
        await sleep(150);
      }
      if(await evalInPage('!!document.querySelector(".zf-mobile-menu-panel")'))
        throw new Error("Catalogue drawer did not close");
      await evalInPage('document.querySelector(".zf-mobile-dock > a:nth-child(2)").click()');
      for(let tries=0;tries<30;tries++){
        if(await evalInPage('location.pathname==="/generos/filmes"'))break;
        await sleep(180);
      }
      if(!await evalInPage('location.pathname==="/generos/filmes"'))
        throw new Error("Filmes tab navigation failed after integrating search");
    }
    console.log(JSON.stringify({event:"apple-glass-browser",name:scenario.name,...state}));
  }
}finally{
  ws?.close();
  browser?.kill("SIGTERM");
  worker.kill("SIGTERM");
}
