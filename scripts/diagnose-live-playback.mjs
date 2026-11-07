// scripts/diagnose-live-playback.mjs — Bun; inspect actual Saimo catalog, headers and deployed TV backend.
import { parseCanais, mergeCanaisCatalogs, filterCanaisAndExtractCategories } from "../src/lib/canais.ts";
import { classifyLiveSource, initialLiveMode } from "../src/lib/live-source.ts";

const timeout = ms => AbortSignal.timeout(ms);
async function shortRequest(url, opts = {}, duration = 7500) {
  const res = await fetch(url, { ...opts, redirect: "follow", signal: timeout(duration) });
  const out = {
    status: res.status,
    type: res.headers.get("content-type") || "",
    range: res.headers.get("content-range") || "",
    destinationHost: new URL(res.url).hostname,
    destinationPath: new URL(res.url).pathname.slice(0, 60),
    cors: res.headers.get("access-control-allow-origin") || "",
    length: res.headers.get("content-length") || "",
  };
  await res.body?.cancel();
  return out;
}
const [txt,m3u] = await Promise.all([
  fetch("https://canais-saimo.pages.dev/catalogo.txt",{ signal:timeout(14000) }).then(x=>x.text()),
  fetch("https://canais-saimo.pages.dev/canais.txt",{ signal:timeout(14000) }).then(x=>x.text()).catch(()=>""),
]);
const channels = filterCanaisAndExtractCategories(mergeCanaisCatalogs([parseCanais(txt),parseCanais(m3u)]),[]).canais;
console.log(JSON.stringify({event:"catalog",channels:channels.length,keys:[...new Set(channels.flatMap(ch=>ch.fontes.map(f=>Object.keys(f).join(","))))].slice(0,10)}));
for (const wanted of ["Amazon Prime Video 01","Band","SBT","CNN Brasil","Globo SP","A&E","GloboNews","SporTV"]) {
  const found = channels.filter(ch=>ch.nome.toLowerCase()===wanted.toLowerCase() || (wanted==="Amazon Prime Video 01" && ch.nome.toLowerCase().includes("amazon prime video 01"))).slice(0,2);
  for(const ch of found){
    const entries=ch.fontes.slice(0,3).map(f=>{
      const u=new URL(f.url);
      return {host:u.hostname,path:u.pathname.slice(0,90),format:classifyLiveSource(f),mode:initialLiveMode(f),https:u.protocol==="https:",referrer:!!f.referer,ua:!!f.agente,clearkey:!!f.chave,quality:f.qualidade||null};
    });
    console.log(JSON.stringify({event:"channel",name:ch.nome,id:ch.id,totalSources:ch.fontes.length,entries}));
    for(const f of ch.fontes.slice(0,2)){
      const u=new URL(f.url);
      const headers={
        Accept:"*/*",Range:"bytes=0-1",
        ...(f.referer?{Referer:f.referer}:{}),
        ...(f.agente?{"User-Agent":f.agente}:{})
      };
      try{
        console.log(JSON.stringify({event:"media-probe",name:ch.nome,host:u.hostname,probe:await shortRequest(f.url,{headers},6500)}));
      }catch(err){ console.log(JSON.stringify({event:"media-probe",name:ch.nome,host:u.hostname,error:err?.cause?.code||err?.name||"fetch"})); }
    }
  }
}
const DEPLOY="https://zangflix.vercel.app";
for(const url of ["/","/tv","/api/version","/api/canais","/api/tv/stream?canal=%21&fonte=0","/api/live-format?canal=band&fonte=0"]){
 try{ console.log(JSON.stringify({event:"deployment",path:url,probe:await shortRequest(DEPLOY+url,{headers:{Accept:"application/json,text/html,*/*"}},7500)})); }
 catch(err){console.log(JSON.stringify({event:"deployment",path:url,error:err?.cause?.code||err?.name||"network"}));}
}
