// scripts/audit-saimo-ui.mjs — Node/Bun; inspect public Saimo frontend architecture, no media downloads.
const BASE="https://saimo-tv.pages.dev/";
const timeout=ms=>AbortSignal.timeout(ms);
const urls=[BASE,"https://saimo-tv.pages.dev/ao-vivo","https://saimo-tv.pages.dev/tv","https://canais-saimo.pages.dev/catalogo.txt","https://saimo-tv.pages.dev/fontes-desativadas.json"];
const seen=new Set();const assets=[];
for(const url of urls){
 try{
 const res=await fetch(url,{signal:timeout(12000),headers:{Accept:"text/html,text/plain,application/json,*/*"}});
 const data=await res.text();
 console.log(JSON.stringify({event:"page",url:new URL(url).pathname,host:new URL(url).host,status:res.status,contentType:res.headers.get("content-type"),size:data.length,first:data.slice(0,220).replace(/\s+/g," ")}));
 if(data.includes("<script")||data.includes("<link")){
   for(const m of data.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["'][^>]*>/g)){
     const path=new URL(m[1],url);
     if(path.host==="saimo-tv.pages.dev"&&(/\.js(?:$|\?)/.test(path.pathname)||path.pathname.includes("/assets/")))assets.push(path.href);
   }
 }
 }catch(e){console.log(JSON.stringify({event:"page-error",host:new URL(url).host,path:new URL(url).pathname,error:String(e).slice(0,180)}));}
}
const terms=[
 "catalogo.txt","fontes-desativadas","/api/canais","/api/live","hls.js",
 "Hls.isSupported","new Hls(","mpegts","shaka","sourceBuffer","clearKeys",
 "referer","userAgent","currentSource","autoplay","error.txt","canal.fontes",
 "new URL(","/ao-vivo","websocket","video.js","clappr","dashjs"
];
for(const asset of [...new Set(assets)].slice(0,12)){
  if(seen.has(asset))continue;seen.add(asset);
  try{
   const res=await fetch(asset,{signal:timeout(16000)});
   if(!res.ok){console.log(JSON.stringify({event:"asset",file:new URL(asset).pathname,status:res.status}));continue}
   const body=await res.text();
   const matches=[];
   for(const term of terms){
    const found=body.toLowerCase().indexOf(term.toLowerCase());
    if(found>=0){
      const near=body.slice(Math.max(0,found-75),Math.min(body.length,found+term.length+90))
       .replace(/https?:\/\/[^\s"'),;]+/g,"<external-url>").replace(/\s+/g," ").slice(0,185);
      matches.push({term,context:near});
    }
   }
   console.log(JSON.stringify({event:"asset",path:new URL(asset).pathname,status:res.status,bytes:body.length,matches:matches.slice(0,28)}));
  }catch(e){console.log(JSON.stringify({event:"asset-error",path:new URL(asset).pathname,error:String(e).slice(0,100)}));}
}
console.log(JSON.stringify({event:"summary",scriptFiles:seen.size,urlsFound:assets.length}));
