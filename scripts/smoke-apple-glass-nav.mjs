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
    search:info(".ydo-search-trigger-btn"),active:info(".zf-mobile-tab.is-active"),
    links:[...document.querySelectorAll(".zf-mobile-tab")].map(el=>el.getAttribute("href")),
    hasBottomSearch:!!document.querySelector(".zf-mobile-dock .zf-mobile-search-fab"),
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
      if(state.hasBottomSearch||state.navItemCount!==5)
        throw new Error("Expected five menu entries and no bottom search icon");
      if(!state.search||state.search.parent!=="ydo-header-tools")
        throw new Error("Upper header search was removed unexpectedly");
      if(Math.abs((state.dock.left+state.dock.right)/2-scenario.width/2)>1)
        throw new Error("Bottom navigation is not horizontally centered: "+JSON.stringify(state.dock));
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
      // The search icon stays in the top header, NOT in the bottom capsule.
      await evalInPage('document.querySelector(".ydo-search-trigger-btn").click()');
      let opened=false;
      for(let tries=0;tries<28;tries++){
        opened=Boolean(await evalInPage('!!document.querySelector(".ydo-search-expand .ydo-search-input")'));
        if(opened)break;
        await sleep(180);
      }
      if(!opened)throw new Error("Upper search field did not open");
      await evalInPage('document.querySelector(".ydo-search-close").click()');
      for(let tries=0;tries<28;tries++){
        if(await evalInPage('!document.querySelector(".ydo-search-expand")'))break;
        await sleep(150);
      }
      if(await evalInPage('!!document.querySelector(".ydo-search-expand")'))
        throw new Error("Upper search field did not close");
      await evalInPage('document.querySelector(".zf-mobile-dock > a:nth-child(2)").click()');
      for(let tries=0;tries<30;tries++){
        if(await evalInPage('location.pathname==="/generos/filmes"'))break;
        await sleep(180);
      }
      if(!await evalInPage('location.pathname==="/generos/filmes"'))
        throw new Error("Filmes tab navigation failed");
    }
    console.log(JSON.stringify({event:"apple-glass-browser",name:scenario.name,...state}));
  }
  // Deterministic empty-anime and search-result states, using the same
  // production components. These fixtures contain no playable media.
  await send("Page.addScriptToEvaluateOnNewDocument",{source:`(()=>{
    const original=window.fetch.bind(window);
    window.fetch=(input,options)=>{
      const url=new URL(String(input?.url||input),location.origin);
      let payload;
      if(url.pathname==="/api/animes-sushi") payload={items:[],pagina:1,totalPaginas:1,totalItens:0};
      if(url.pathname==="/api/catalogo") payload=url.searchParams.has("suggest")
        ?{items:[{id:"icon-anime-fixture",title:"Anime de teste",type:"a",posterUrl:null,year:2026}]}
        :{items:[],highlights:[],genres:[]};
      return payload?Promise.resolve(new Response(JSON.stringify(payload),{status:200,headers:{"Content-Type":"application/json"}})):original(input,options);
    };
  })()`});
  for(const scenario of cases.filter(item=>item.name==="mobile"||item.name==="desktop")){
    await send("Emulation.setDeviceMetricsOverride",{width:scenario.width,height:scenario.height,
      deviceScaleFactor:scenario.mobile?2:1,mobile:scenario.mobile});
    await send("Emulation.setUserAgentOverride",{userAgent:scenario.ua});
    await send("Page.navigate",{url:BASE+"/animes"});
    let ready=false;
    for(let attempt=0;attempt<70;attempt++){
      ready=await evalInPage('!!document.querySelector(".ydo-search-header .lucide-animation-frames")&&!!document.querySelector(".ydo-empty-state .lucide-animation-frames")');
      if(ready)break;
      await sleep(200);
    }
    if(!ready)throw new Error("Shared anime pictogram missing from heading or empty state");
    const icon=await evalInPage(`(()=>{
      const svg=document.querySelector(".ydo-search-header .lucide-animation-frames");
      return {stroke:parseFloat(getComputedStyle(svg).strokeWidth),width:svg.getBoundingClientRect().width,
        decorative:!!document.querySelector(".lucide-sparkles,.lucide-orbit"),
        dock:!!document.querySelector('.zf-mobile-tab[title="Animes"][aria-current="page"] .lucide-animation-frames')};
    })()`);
    if(icon.stroke!==1.8||icon.width!==28||icon.decorative||(scenario.mobile&&!icon.dock))
      throw new Error("Inconsistent anime iconography: "+JSON.stringify(icon));
    let screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
    writeFileSync("artifacts/apple-glass-icons-anime-"+scenario.name+".png",Buffer.from(screenshot.data,"base64"));
    await evalInPage('document.querySelector(".ydo-search-trigger-btn").click()');
    await sleep(150);
    await send("Input.insertText",{text:"Anime"});
    let result=false;
    for(let attempt=0;attempt<35;attempt++){
      result=await evalInPage('!!document.querySelector(".zf-search-poster .lucide-animation-frames")');
      if(result)break;
      await sleep(180);
    }
    if(!result)throw new Error("Anime search fallback is not using the shared pictogram");
    screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
    writeFileSync("artifacts/apple-glass-icons-search-"+scenario.name+".png",Buffer.from(screenshot.data,"base64"));
    console.log(JSON.stringify({event:"professional-iconography",device:scenario.name,heading:true,empty:true,search:true,...icon}));
  }
  // Verify content and genre together with deterministic, non-playable fixtures.
  const fixtureItems=[
    {id:"f-horror",title:"Filme Terror",type:"f",genres:["Horror"]},
    {id:"f-action",title:"Filme Ação",type:"f",genres:["Action"]},
    {id:"s-horror",title:"Série Terror",type:"s",genres:["Horror"]},
    {id:"s-action",title:"Série Ação",type:"s",genres:["Action"]},
    {id:"a-action",title:"Anime Ação",type:"a",genres:["Anime","Action"]},
    {id:"a-shonen",title:"Anime Shōnen",type:"a",genres:["Anime","Shounen"]},
  ].map(item=>({...item,streams:[{url:"pending",audio:"dub"}]}));
  await send("Page.addScriptToEvaluateOnNewDocument",{source:
    `(()=>{const original=window.fetch.bind(window),items=${JSON.stringify(fixtureItems)};
      window.__catalogReads=0;
      window.fetch=(input,options)=>{const url=new URL(String(input?.url||input),location.origin);
       let payload;
       if(url.pathname==="/api/catalogo"){window.__catalogReads++;payload={items,highlights:[],genres:[]};}
       if(url.pathname==="/api/animes-sushi")payload={items:[],pagina:1,totalPaginas:1,totalItens:0};
       return payload?Promise.resolve(new Response(JSON.stringify(payload),{headers:{"Content-Type":"application/json"}})):original(input,options);
      };
    })()`});
  const filterState=()=>evalInPage(`(()=>{
    const root=document.querySelector('.zf-mobile-catalog'),rect=root?.getBoundingClientRect();
    return {path:location.pathname,query:location.search,display:root&&getComputedStyle(root).display,
      left:rect?.left,right:rect?.right,width:innerWidth,bodyWidth:document.documentElement.scrollWidth,
      type:root?.querySelector('.zf-mobile-catalog-type[aria-current="page"]')?.textContent,
      category:root?.querySelector('.zf-mobile-catalog-chip.is-selected')?.textContent,
      cards:Array.from(document.querySelectorAll('.ydo-search-grid .ydo-card')).map(card=>card.querySelector('.ydo-card-poster-link')?.getAttribute('aria-label')),
      reads:window.__catalogReads};
  })()`);
  const waitFilters=async predicate=>{
    for(let attempt=0;attempt<75;attempt++){const value=await filterState().catch(()=>null);if(value&&predicate(value))return value;await sleep(120);}
    throw Error('Mobile catalog state timeout: '+JSON.stringify(await filterState()));
  };
  const pickFilter=async(selector,label)=>{
    await evalInPage(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(link=>link.textContent.trim()===${JSON.stringify(label)}).click()`);
  };
  for(const scenario of cases.filter(item=>["mobile-320","mobile","desktop"].includes(item.name))){
    await send("Emulation.setDeviceMetricsOverride",{width:scenario.width,height:scenario.height,mobile:scenario.mobile,deviceScaleFactor:scenario.mobile?2:1});
    await send("Emulation.setUserAgentOverride",{userAgent:scenario.ua});
    await send("Page.navigate",{url:BASE+"/generos/filmes"});
    const initial=await waitFilters(s=>s.path==='/generos/filmes'&&s.cards.length===2&&s.reads===1);
    if(!scenario.mobile){if(initial.display!=='none')throw Error('Desktop compact filters should remain hidden');continue;}
    if(initial.display==='none'||initial.left<0||initial.right>scenario.width+1||initial.bodyWidth>scenario.width+1)
      throw Error('Mobile filter layout overflows: '+JSON.stringify(initial));
    await pickFilter('.zf-mobile-catalog-chip','Terror');
    const horror=await waitFilters(s=>s.category==='Terror'&&s.type==='Filmes'&&s.cards.length===1&&s.cards[0].includes('Filme Terror'));
    let shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync('artifacts/apple-glass-catalog-'+scenario.name+'.png',Buffer.from(shot.data,'base64'));
    await pickFilter('.zf-mobile-catalog-type','Séries');
    await waitFilters(s=>s.category==='Terror'&&s.type==='Séries'&&s.cards.length===1&&s.cards[0].includes('Série Terror'));
    await pickFilter('.zf-mobile-catalog-type','Animes');
    await waitFilters(s=>s.path==='/animes'&&s.category==='Todos'&&s.cards.length===2);
    await pickFilter('.zf-mobile-catalog-chip','Ação');
    await waitFilters(s=>s.category==='Ação'&&s.type==='Animes'&&s.cards.length===1&&s.cards[0].includes('Anime Ação'));
    await pickFilter('.zf-mobile-catalog-type','Filmes');
    await waitFilters(s=>s.category==='Ação'&&s.type==='Filmes'&&s.cards.length===1&&s.cards[0].includes('Filme Ação'));
    await evalInPage('history.back()');
    const restored=await waitFilters(s=>s.path==='/animes'&&s.category==='Ação'&&s.cards.length===1&&s.cards[0].includes('Anime Ação'));
    if(restored.reads!==1)throw Error('Switching filters refetched the entire catalog');
    console.log(JSON.stringify({event:'mobile-catalog-filters',device:scenario.name,horror,restored}));
  }

  // Dated campaign: genuine movie metadata and non-playable catalog fixtures.
  const fridayMovies=[{"id":"sextafeira 13","type":"f","title":"Sexta-Feira 13","tmdbId":13207,"posterPath":"/9tXjmu3J8ad4IpvrjEMS4ZxmsjN.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/9tXjmu3J8ad4IpvrjEMS4ZxmsjN.jpg","genres":["Terror","Suspense"],"tmdb":null,"streams":[]},{"id":"sextafeira 13 1980","type":"f","title":"Sexta-Feira 13","tmdbId":4488,"posterPath":"/rdrVW0qN16Ho8BDwmcqW9oLQtn3.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/rdrVW0qN16Ho8BDwmcqW9oLQtn3.jpg","genres":["Terror"],"tmdb":null,"streams":[]}];
  fridayMovies[0].tmdb={backdropUrl:"https://image.tmdb.org/t/p/original/xECaVCK8nT1KCKdGg01mQgizuOd.jpg",releaseYear:2009,overview:"Crystal Lake guarda um passado que ninguém esqueceu.",voteAverage:5.8};
  fridayMovies[1].tmdb={releaseYear:1980};
  const zangsMovies=[{"id":"invocacao do mal","type":"f","title":"Invocação do Mal","tmdbId":138843,"posterPath":"/1NxHKZW5DPbUFtbF3MxbdSyxRqU.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/1NxHKZW5DPbUFtbF3MxbdSyxRqU.jpg","genres":["Terror","Suspense"],"tmdb":null,"streams":[]},{"id":"panico na floresta 2003","type":"f","title":"Panico na Floresta","tmdbId":9902,"posterPath":"/mQVIIUXHo3Qpd6nu0api7UyMpas.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/mQVIIUXHo3Qpd6nu0api7UyMpas.jpg","genres":["Terror","Suspense"],"tmdb":null,"streams":[]},{"id":"o albergue 2006","type":"f","title":"O Albergue","tmdbId":1690,"posterPath":"/lF0qaRHBa86mOHomjunVg31fJMz.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/lF0qaRHBa86mOHomjunVg31fJMz.jpg","genres":["Terror"],"tmdb":null,"streams":[]},{"id":"o albergue 2 2007","type":"f","title":"O Albergue 2","tmdbId":1691,"posterPath":"/hilegO5kmza8W6T2E6v7TlY3WwE.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/hilegO5kmza8W6T2E6v7TlY3WwE.jpg","genres":["Terror"],"tmdb":null,"streams":[]},{"id":"o albergue 3 2011","type":"f","title":"O Albergue 3","tmdbId":71670,"posterPath":"/YUYdVD8hBud7j5mQ33kj1lGhGQ.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/YUYdVD8hBud7j5mQ33kj1lGhGQ.jpg","genres":["Terror"],"tmdb":null,"streams":[]},{"id":"hereditario","type":"f","title":"Hereditario","tmdbId":493922,"posterPath":"/x9tUYQj6WrdVwoKimSdoMzkDABS.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/x9tUYQj6WrdVwoKimSdoMzkDABS.jpg","genres":["Terror","Mistério","Suspense"],"tmdb":null,"streams":[]},{"id":"midsommar o mal nao espera a noite","type":"f","title":"Midsommar: O Mal Não Espera a Noite","tmdbId":530385,"posterPath":"/hR4dXPlWq5Nekwjqbp3gFGeiiZS.jpg","posterUrl":"https://image.tmdb.org/t/p/w500/hR4dXPlWq5Nekwjqbp3gFGeiiZS.jpg","genres":["Terror","Drama","Mistério"],"tmdb":null,"streams":[]}];
  const regularMovie={id:"habitual",title:"Destaque habitual",type:"f",genres:["Drama"],streams:[],tmdb:{backdropUrl:"https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s520QIq.jpg"}};
  await send("Page.addScriptToEvaluateOnNewDocument",{source:
    '(()=>{const NativeDate=Date;let offset=Date.parse("2026-11-13T18:00:00Z")-NativeDate.now();'+
    'class CampaignDate extends NativeDate{constructor(...args){super(...(args.length?args:[NativeDate.now()+offset]));}static now(){return NativeDate.now()+offset;}}'+
    'window.Date=CampaignDate;window.__setCampaignClock=now=>{offset=now-NativeDate.now();window.dispatchEvent(new Event("pageshow"));};'+
    'const original=window.fetch.bind(window),special='+JSON.stringify(fridayMovies)+',picks='+JSON.stringify(zangsMovies)+',regular='+JSON.stringify(regularMovie)+';'+
    'window.__editionCatalogReads=0;window.fetch=(input,options)=>{const url=new URL(String(input?.url||input),location.origin);'+
    'if(url.pathname==="/api/catalogo"){window.__editionCatalogReads++;return Promise.resolve(new Response(JSON.stringify({items:[...special,...picks,regular],highlights:[],genres:[],featuredHero:[regular],friday13Hero:special}),{headers:{"Content-Type":"application/json"}}));}'+
    'return original(input,options);};})()'});
  const editionState=()=>evalInPage("(()=>{\n  const hero=document.querySelector('.ydo-hero'),mast=document.querySelector('.zf-friday13-masthead');\n  const title=document.querySelector('.ydo-hero-title'),fog=document.querySelector('.zf-friday13-fog');\n  const mark=document.querySelector('.zf-friday13-date'),orbit=document.querySelector('.zf-friday13-orbit');\n  const picks=document.querySelector('.zf-zangs-picks');\n  return {active:document.documentElement.dataset.zfEdition||null,\n    hero:hero?.classList.contains('zf-friday13-hero'),title:title?.textContent,\n    top:title?.getBoundingClientRect().top,mastBottom:mast?.getBoundingClientRect().bottom,\n    image:document.querySelector('.ydo-hero-img')?.currentSrc,\n    collection:!!document.querySelector('.zf-friday13-collection'),\n    picks:Array.from(picks?.querySelectorAll('.ydo-card-poster-link')||[]).map(x=>decodeURIComponent(x.getAttribute('href'))),\n    titlePicks:picks?.querySelector('h2')?.textContent,\n    afterCollection:!!picks?.previousElementSibling?.classList.contains('zf-friday13-collection'),\n    mark:mark&&{text:mark.textContent,border:getComputedStyle(mark).borderTopWidth,color:getComputedStyle(mark).color,background:getComputedStyle(mark).backgroundColor,svg:!!mark.querySelector('svg')},\n    orbit:orbit&&getComputedStyle(orbit).animationName,\n    play:document.querySelector('.ydo-hero-actions .ydo-btn-primary')?.getAttribute('href'),\n    animation:fog&&getComputedStyle(fog).animationName,\n    width:innerWidth,bodyWidth:document.documentElement.scrollWidth,reads:window.__editionCatalogReads};\n})()");
  const waitEdition=async predicate=>{
    for(let n=0;n<80;n++){const s=await editionState().catch(()=>null);if(s&&predicate(s))return s;await sleep(100);}
    throw Error('Friday 13 state timeout: '+JSON.stringify(await editionState()));
  };
  for(const scenario of cases.filter(item=>["mobile-320","mobile","desktop"].includes(item.name))){
    await send("Emulation.setDeviceMetricsOverride",{width:scenario.width,height:scenario.height,mobile:scenario.mobile,deviceScaleFactor:scenario.mobile?2:1});
    await send("Emulation.setUserAgentOverride",{userAgent:scenario.ua});
    await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
    await send("Page.navigate",{url:BASE+"/"});
    const edition=await waitEdition(s=>s.active==="friday13"&&s.hero&&s.collection&&s.title==="Sexta-Feira 13"&&!!s.image&&s.picks.length===7);
    if(edition.bodyWidth>scenario.width+1||edition.mastBottom+12>edition.top)
      throw Error('Campaign layout overlaps/overflows: '+JSON.stringify(edition));
    if(edition.animation!=="none"||edition.orbit!=="none")throw Error("Campaign ignores reduced motion");
    if(edition.mark?.text!=="13"||edition.mark?.svg||edition.mark?.border!=="0px"||
      edition.mark?.color!=="rgb(255, 255, 255)"||edition.mark?.background!=="rgba(0, 0, 0, 0)")
      throw Error("Number 13 must be white without a box or weapon: "+JSON.stringify(edition.mark));
    if(!edition.afterCollection||edition.titlePicks!=="Escolha do Zangs"||
      !edition.picks[0]?.includes("/filme/invocacao do mal")||!edition.picks[6]?.includes("/filme/midsommar"))
      throw Error("Curated movie selection or placement is incorrect");
    await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"no-preference"}]});
    if((await editionState()).orbit!=="zf-friday13-orbit")throw Error("Red orbit is not animated");
    await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
    if(!decodeURIComponent(edition.play||"").startsWith("/assistir/filme/sextafeira 13"))
      throw Error("Campaign movie playback destination is incorrect");
    if(!edition.image.includes(scenario.mobile?"/w1280/":"/original/"))
      throw Error("Campaign is not using the correct high-resolution banner");
    const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
    writeFileSync("artifacts/apple-glass-friday13-"+scenario.name+".png",Buffer.from(shot.data,"base64"));
    await evalInPage("document.querySelector('.zf-zangs-picks').scrollIntoView({block:'start',behavior:'instant'})");
    // Visit every card: mobile intentionally defers posters outside its scroll viewport.
    const posterState=await evalInPage(`(async()=>{
      const section=document.querySelector('.zf-zangs-picks'),row=section.querySelector('.ydo-row-track');
      const result=[];
      for(const card of row.querySelectorAll('.ydo-card')){
        card.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});
        const img=card.querySelector('img');
        if(img&&!img.complete)await new Promise(resolve=>{
          img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});
          setTimeout(resolve,10000);
        });
        result.push({title:card.querySelector('.ydo-card-title')?.textContent,loaded:!!card.querySelector('img')?.naturalWidth});
      }
      row.scrollTo({left:0,behavior:'instant'});
      section.scrollIntoView({block:'start',behavior:'instant'});
      return result;
    })()`);
    if(posterState.some(p=>!p.loaded))throw Error('Curated artwork did not load: '+JSON.stringify(posterState));
    console.log(JSON.stringify({event:'zangs-poster-artwork',device:scenario.name,posters:posterState}));
    const collectionShot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
    writeFileSync("artifacts/apple-glass-zangs-picks-"+scenario.name+".png",Buffer.from(collectionShot.data,"base64"));
    await evalInPage("scrollTo(0,0)");
    await evalInPage('window.__setCampaignClock(Date.parse("2026-11-14T03:00:00Z"))');
    const expired=await waitEdition(s=>s.active===null&&!s.hero&&!s.collection&&s.title==="Destaque habitual");
    if(expired.reads!==1||expired.picks.length!==7)throw Error("Expiry must preserve curated films without reloading the catalog");
    // The last 250ms must expire through the real timer, without another event.
    await evalInPage('window.__setCampaignClock(Date.parse("2026-11-14T03:00:00Z")-250)');
    await waitEdition(s=>s.active==="friday13"&&s.hero);
    await waitEdition(s=>s.active===null&&!s.hero&&!s.collection&&s.title==="Destaque habitual");
    console.log(JSON.stringify({event:"friday13-edition",device:scenario.name,edition,expired,automaticExpiry:true}));
  }

}finally{
  ws?.close();
  browser?.kill("SIGTERM");
  worker.kill("SIGTERM");
}
