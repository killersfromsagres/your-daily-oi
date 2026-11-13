// scripts/probe-tv-bahia.mjs — Bun; response timing and HLS marker only, no media saved.
import { liveSourceFingerprint } from "../src/lib/live-source.ts";
const TARGET="Globo Bahia";
const catalog=await (await fetch("https://zangflix.vercel.app/api/canais",{signal:AbortSignal.timeout(15000)})).json();
const channel=catalog.canais.find(c=>c.nome===TARGET);
if(!channel?.fontes.length)throw new Error("Globo Bahia absent from current catalog");
const src=channel.fontes[0];
const local=new URL("https://zangflix.vercel.app/api/tv/stream");
local.searchParams.set("canal",channel.id);
local.searchParams.set("fonte","0");
local.searchParams.set("assinatura",liveSourceFingerprint(src.url));
const reference=new URL("https://saimo-tv.pages.dev/api/proxy");
reference.searchParams.set("url",src.url);
if(src.referer)reference.searchParams.set("referer",src.referer);
if(src.agente)reference.searchParams.set("ua",src.agente);
async function probe(label,url,timeout){
 const controller=new AbortController(),begin=Date.now();
 const timer=setTimeout(()=>controller.abort(),timeout);
 let response;
 try {
  response=await fetch(url,{headers:{Accept:"application/vnd.apple.mpegurl,*/*"},signal:controller.signal});
  const tHeaders=Date.now()-begin;
  const mime=response.headers.get("content-type")||"";
  let head="";
  if(response.ok&&response.body){
    const reader=response.body.getReader();
    try{const {value}=await reader.read();head=new TextDecoder().decode((value||new Uint8Array()).slice(0,300));}
    finally{await reader.cancel().catch(()=>{});}
  } else await response.body?.cancel().catch(()=>{});
  console.log(JSON.stringify({label,timeout,http:response.status,mime:mime.split(";")[0],headerMs:tHeaders,
    totalMs:Date.now()-begin,validManifest:head.trimStart().startsWith("#EXTM3U")}));
 }catch(e){console.log(JSON.stringify({label,timeout,error:e?.name||"fetch",elapsedMs:Date.now()-begin}));}
 finally{clearTimeout(timer);try{await response?.body?.cancel();}catch{}}
}
await probe("saimo",reference.href,12000);
await probe("zang-6s",local.href,6000);
await probe("zang-20s",local.href,20000);
