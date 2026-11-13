// scripts/compare-saimo-zang-tv.mjs — Bun; every public Saimo TV source against ZANG FLIX production.
// Bounded header/manifest sniff only. Never store signed media URLs, DRM keys, segments, cookies or video.
import { mkdirSync, writeFileSync } from "node:fs";
import { parseCanais, mergeCanaisCatalogs, filterCanaisAndExtractCategories, slugifyCanal } from "../src/lib/canais.ts";
import { liveSourceFingerprint } from "../src/lib/live-source.ts";

const MAIN = process.env.ZANG_BASE || "https://zangflix.vercel.app";
const SAIMO = process.env.SAIMO_BASE || "https://saimo-tv.pages.dev";
const SOURCES = [
  "https://canais-saimo.pages.dev/catalogo.txt",
  "https://canais-saimo.pages.dev/canais.txt",
];
const MAX_SOURCES = Math.max(1,Number(process.env.PARITY_MAX_SOURCES || 99999));
const CONCURRENCY = Math.min(10,Math.max(1,Number(process.env.PARITY_CONCURRENCY || 6)));
const TIMEOUT = Math.max(1500,Math.min(9000,Number(process.env.PARITY_TIMEOUT_MS || 5500)));
const MAX_BYTES = 2048;
const startAt = Date.now();
const startIso = new Date().toISOString();
const fetchText = async url => {
  const response=await fetch(url,{signal:AbortSignal.timeout(12000),cache:"no-store"});
  if (!response.ok) throw new Error(new URL(url).host+" HTTP "+response.status);
  return response.text();
};
function extractHost(url) {
  try {return new URL(url).hostname.toLowerCase();} catch {return "(invalid)";}
}
function publicHeaders(src) {
  return {
    Accept:"application/vnd.apple.mpegurl,application/x-mpegURL,application/dash+xml,video/*,*/*",
    ...(src.referer ? { Referer:src.referer } : {}),
    ...(src.agente ? { "User-Agent":src.agente } : {}),
  };
}
function proxyUrl(base, path, src, index, channelId) {
  const url=new URL(path,base);
  if(path==="/api/tv/stream"){
    url.searchParams.set("canal",channelId);
    url.searchParams.set("fonte",String(index));
    url.searchParams.set("assinatura",liveSourceFingerprint(src.url));
  } else {
    url.searchParams.set("url",src.url);
    if(src.referer) url.searchParams.set("referer",src.referer);
    if(src.agente) url.searchParams.set("ua",src.agente);
  }
  return url.toString();
}
function classify(status,type,first) {
  if(status===401||status===403)return "denied";
  if(status===404||status===410)return "missing";
  if(status===409)return "catalog-mismatch";
  if(status===429)return "rate-limit";
  if(status>=500)return "origin-error";
  if(status>=400)return "http-error";
  const mime=type.toLowerCase().split(";")[0].trim();
  if(/<!doctype html|<html|<head/i.test(first)||mime.includes("text/html"))return "html";
  // Content-Type alone is not proof of a playable manifest. Some upstream
  // gateways return HTTP 218 with an HLS MIME but a non-HLS error body.
  if (/mpegurl|mpeg-url/i.test(mime)) {
    return first.trimStart().startsWith("#EXTM3U")
      ? "media-candidate" : "invalid-hls-body";
  }
  if (mime.includes("dash+xml")) {
    return /<MPD[\s>]/i.test(first)
      ? "media-candidate" : "invalid-dash-body";
  }
  if(first.trimStart().startsWith("#EXTM3U")||
     /video\/mp2t|video\/mp4|application\/mp4/.test(mime) ||
     /<MPD[\s>]/i.test(first))return "media-candidate";
  if(mime.includes("application/json"))return "json";
  return "unconfirmed";
}
async function probe(url,source,timeout=TIMEOUT) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  let response;
  try {
    response=await fetch(url,{method:"GET",signal:controller.signal,redirect:"follow",
      headers:{"Accept":"application/vnd.apple.mpegurl,application/dash+xml,video/*,*/*",
        // HLS manifests must be complete; binary fragments are not downloaded.
        ...(/^https?:\/\/[^/]+\/api\/proxy/.test(url)?{}:{})}});
    const status=response.status,mime=response.headers.get("content-type")||"";
    let prefix="";
    if(response.ok && response.body) {
      const reader=response.body.getReader();
      try {
        const {value}=await reader.read();
        prefix=new TextDecoder().decode((value||new Uint8Array()).slice(0,MAX_BYTES));
      } finally {await reader.cancel().catch(()=>{});}
    } else await response.body?.cancel().catch(()=>{});
    return {http:status,contentType:mime.split(";")[0],result:classify(status,mime,prefix)};
  } catch(error) {
    return {http:null,contentType:null,result:error?.name==="AbortError"?"timeout":"network-error"};
  } finally {
    clearTimeout(timer);
    try {await response?.body?.cancel();} catch {}
  }
}
const downloads=await Promise.allSettled(SOURCES.map(fetchText));
const raw=downloads.filter(x=>x.status==="fulfilled").map(x=>parseCanais(x.value));
if(!raw.length)throw new Error("Nenhum catálogo público Saimo disponível");
let disabled=[];
try {
  const json=JSON.parse(await fetchText(SAIMO+"/fontes-desativadas.json"));
  disabled=Array.isArray(json.desativados)?json.desativados:[];
} catch {}
const reference=filterCanaisAndExtractCategories(mergeCanaisCatalogs(raw),disabled).canais;
const response=await fetch(MAIN+"/api/canais",{signal:AbortSignal.timeout(20000),cache:"no-store"});
if(!response.ok)throw new Error("ZANG /api/canais indisponível HTTP "+response.status);
const site=await response.json();
if(!Array.isArray(site.canais))throw new Error("ZANG /api/canais sem lista");
const ours=new Map(site.canais.map(ch=>[slugifyCanal(ch.nome),ch]));
const ids=new Set(reference.map(ch=>slugifyCanal(ch.nome)));
const missing=reference.filter(ch=>!ours.has(slugifyCanal(ch.nome)));
const extra=site.canais.filter(ch=>!ids.has(slugifyCanal(ch.nome)));
const tasks=reference.flatMap(ch=>{
  const local=ours.get(slugifyCanal(ch.nome));
  return ch.fontes.map((src,index)=>{
    const at=local?.fontes?.findIndex(f=>f.url===src.url)??-1;
    return {channel:ch.nome,id:ch.id,refSourceIndex:index,ourSourceIndex:at,source:src,
      siteChannelId:local?.id||null};
  });
}).slice(0,MAX_SOURCES);
let cursor=0,completed=0;
const rows=Array(tasks.length);
const match=new Set(["media-candidate"]);
async function worker(){
  for(;;){
    const slot=cursor++;
    if(slot>=tasks.length)break;
    const t=tasks[slot];
    const base={name:t.channel,id:t.id,sourceIndex:t.refSourceIndex,host:extractHost(t.source.url),
      ourSourceIndex:t.ourSourceIndex, protected:!!t.source.chave};
    let saimo={result:"not-tested",http:null},zang={result:"not-tested",http:null};
    if(!t.source.chave){
      // A 2 KB manifest probe is *not* confirmation of playback.
      const saimoUrl=proxyUrl(SAIMO,"/api/proxy",t.source,-1,t.id);
      saimo=await probe(saimoUrl,t.source);
      if(t.ourSourceIndex>=0&&t.siteChannelId){
        zang=await probe(proxyUrl(MAIN,"/api/tv/stream",t.source,t.ourSourceIndex,t.siteChannelId),t.source);
      } else zang={result:"not-in-zang-catalog",http:null};
    }else{
      saimo={result:"protected-no-playback-test",http:null};
      zang={result:"protected-no-playback-test",http:null};
    }
    const sa=match.has(saimo.result),za=match.has(zang.result);
    const parity=sa&&!za?"saimo-media-zang-failed":sa&&za?"both-media":
      !sa&&za?"zang-media-saimo-failed":t.ourSourceIndex<0?"missing-source-in-zang":
      "no-confirmed-media";
    rows[slot]={...base,saimo,zang,parity};
    completed++;
    if(completed%50===0)console.log(JSON.stringify({event:"progress",completed,total:tasks.length,minutes:Math.round((Date.now()-startAt)/60000)}));
    await new Promise(r=>setTimeout(r,75));
  }
}
await Promise.all(Array.from({length:CONCURRENCY},worker));
const byChannel=reference.map(ch=>{
  const sourceRows=rows.filter(row=>row.id===ch.id);
  const local=ours.get(slugifyCanal(ch.nome));
  return {id:ch.id,name:ch.nome,referenceSources:ch.fontes.length,
    localSources:local?.fontes?.length||0,present:!!local,
    saimoMedia:sourceRows.filter(row=>row.saimo.result==="media-candidate").length,
    zangMedia:sourceRows.filter(row=>row.zang.result==="media-candidate").length,
    saimoOnly:sourceRows.filter(row=>row.parity==="saimo-media-zang-failed").length,
    discrepancy:sourceRows.map(row=>row.parity),
  };
});
const tally=(list,key)=>Object.fromEntries([...list.reduce((acc,x)=>acc.set(x[key],(acc.get(x[key])||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
const overview={checkedAt:startIso,referenceSource:"Saimo public catalogo.txt/canais.txt",
  target:MAIN,referenceChannels:reference.length,zangChannels:site.canais.length,
  referenceSources:reference.reduce((n,ch)=>n+ch.fontes.length,0),
  testedSources:tasks.length,missingChannels:missing.map(ch=>ch.nome),
  extraChannels:extra.map(ch=>ch.nome),parity:tally(rows,"parity"),
  note:"HTTP manifest/header probes from US GitHub Actions; neither actual browser playback nor Saimo interactive UI availability is confirmed. DRM-protected entries not playback-tested."};
const audit={overview,byChannel,sources:rows};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/tv-saimo-zang-parity.json",JSON.stringify(audit,null,2));
const csv=["id,name,sourceIndex,host,localSourceIndex,saimoHttp,saimoStatus,zangHttp,zangStatus,parity",
  ...rows.map(row=>[
    row.id,row.name,row.sourceIndex,row.host,row.ourSourceIndex,row.saimo.http||"",row.saimo.result,
    row.zang.http||"",row.zang.result,row.parity
  ].map(value=>'"'+String(value).replaceAll('"','""')+'"').join(","))].join("\n");
writeFileSync("artifacts/tv-saimo-zang-parity.csv",csv);
console.log(JSON.stringify({event:"overview",...overview}));
for(const ch of byChannel) console.log(JSON.stringify({event:"channel",...ch}));
for (const row of rows) {
  if (row.parity === "saimo-media-zang-failed") {
    console.log(JSON.stringify({event:"unresolved",name:row.name,sourceIndex:row.sourceIndex,
      host:row.host,saimo:row.saimo,zang:row.zang}));
  }
}
console.log(JSON.stringify({event:"finished",durationSec:Math.round((Date.now()-startAt)/1000)}));
