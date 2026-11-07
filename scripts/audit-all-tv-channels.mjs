// scripts/audit-all-tv-channels.mjs — Bun, public Saimo channel/stream health probe. No media retained.
import { mkdirSync, writeFileSync } from "node:fs";
import { loadCanais } from "../src/lib/canais.ts";
import { classifyLiveSource } from "../src/lib/live-source.ts";

const START = Date.now(), CONCURRENCY = 7, TIMEOUT_MS = 5000, MAX_SNIFF_BYTES = 1536;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const reportPath = "artifacts/tv-health-audit.json";
const safeHost = input => { try {return new URL(input).hostname.toLowerCase();}catch{return "(invalid)";} };
function mimeClass(value) {
  const mime = (value || "").split(";")[0].trim().toLowerCase();
  if (/mpegurl|mpeg-url|x-mpegurl/.test(mime)) return "HLS";
  if (mime.includes("dash+xml")) return "DASH";
  if (mime === "video/mp2t") return "TS";
  if (mime === "video/mp4" || mime === "application/mp4") return "MP4";
  if (mime.includes("text/html")) return "HTML";
  if (mime.includes("application/json")) return "JSON";
  return mime || "unknown";
}
function classifyHTTP(status,mime,prefix) {
  if(status===401 || status===403) return "access-denied";
  if(status===404 || status===410) return "not-found";
  if(status===429) return "rate-limited";
  if(status>=500) return "origin-error";
  if(status>=400) return "other-http-error";
  if(mime==="HTML" || /<!doctype html|<html/i.test(prefix)) return "html-not-video";
  if(mime==="JSON" && !prefix.includes("#EXTM3U")) return "json-not-video";
  if(prefix.startsWith("#EXTM3U") || mime==="HLS" || mime==="DASH") return "manifest-candidate";
  if(mime==="TS" || mime==="MP4") return "media-candidate";
  if((prefix.startsWith("<?xml") || prefix.startsWith("<MPD")) && prefix.includes("MPD")) return "manifest-candidate";
  return "unconfirmed-2xx";
}
async function checkOne(item) {
  const {channel,source,catalogIndex} = item;
  const host=safeHost(source.url);
  const base={id:channel.id,name:channel.nome,category:channel.categoria,index:catalogIndex,host,
    scheme:source.url.startsWith("https:")?"https":"http",format:classifyLiveSource(source),
    hasReferer:!!source.referer,hasAgent:!!source.agente,hasClearKey:!!source.chave};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  let response;
  try{
    response=await fetch(source.url,{method:"GET",redirect:"follow",signal:controller.signal,headers:{
      Accept:"application/vnd.apple.mpegurl,application/x-mpegURL,application/dash+xml,video/*,*/*",
      Range:"bytes=0-1535",...(source.referer?{Referer:source.referer}:{}),
      ...(source.agente?{"User-Agent":source.agente}:{})
    }});
    const status=response.status,mime=mimeClass(response.headers.get("content-type"));
    const cors=response.headers.get("access-control-allow-origin");
    let prefix="";
    if(response.ok && ["HLS","DASH","JSON","HTML","unknown"].includes(mime)){
      const reader=response.body?.getReader();
      if(reader){
        try{const first=await reader.read();prefix=new TextDecoder().decode((first.value||new Uint8Array()).slice(0,MAX_SNIFF_BYTES));}
        finally{await reader.cancel().catch(()=>{});}
      }
    }else await response.body?.cancel().catch(()=>{});
    return {...base,status,mime,result:classifyHTTP(status,mime,prefix),
      cors:cors==="*"?"wildcard":cors?"specific":"missing",
      redirected:new URL(response.url).hostname!==host,elapsedMs:Date.now()-item.startTime};
  }catch(error){
    return {...base,status:null,mime:null,result:error?.name==="AbortError"?"timeout":"network-failure",
      cors:"unknown",errorName:error?.name||"FetchError",elapsedMs:Date.now()-item.startTime};
  }finally{
    clearTimeout(timer);
    try{await response?.body?.cancel();}catch{}
  }
}
const catalog=await loadCanais(),channels=catalog.canais;
const tasks=channels.flatMap(channel=>channel.fontes.map((source,catalogIndex)=>({channel,source,catalogIndex,startTime:0})));
const hostTasks=new Map();
for(const item of tasks){
  const host=safeHost(item.source.url);
  if(!hostTasks.has(host))hostTasks.set(host,[]);
  hostTasks.get(host).push(item);
}
// Interleave providers to keep request concurrency modest and diversified.
const groups=[...hostTasks.values()].sort((a,b)=>b.length-a.length);
const queue=[];
while(groups.some(group=>group.length)){
  for(const group of groups)if(group.length)queue.push(group.shift());
}
const results=[];let cursor=0;
async function worker(){
  while(cursor<queue.length){
    const item=queue[cursor++];
    item.startTime=Date.now();
    results.push(await checkOne(item));
    if(results.length%65===0)console.log(JSON.stringify({event:"progress",checked:results.length,total:tasks.length,elapsedS:Math.round((Date.now()-START)/1000)}));
    await wait(60);
  }
}
await Promise.all(Array.from({length:CONCURRENCY},worker));
const candidates=new Set(["manifest-candidate","media-candidate"]);
const byChannel=channels.map(channel=>{
  const src=results.filter(x=>x.id===channel.id).sort((a,b)=>a.index-b.index);
  const confirmed=src.filter(x=>candidates.has(x.result));
  const blocked=src.filter(x=>x.result==="access-denied");
  const other=src.filter(x=>x.result==="unconfirmed-2xx");
  const status=!src.length?"no-sources":confirmed.length?"upstream-media-candidate":other.length?"uncertain":"all-probes-failed";
  return {id:channel.id,name:channel.nome,category:channel.categoria,sourceCount:src.length,candidateCount:confirmed.length,
    accessDeniedCount:blocked.length,status,responses:src.map(r=>String(r.status??r.result)+":"+r.host)};
});
const counts=(rows,key)=>Object.fromEntries([...rows.reduce((acc,x)=>acc.set(x[key]??"missing",(acc.get(x[key]??"missing")||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));
const byCategory=[...new Set(channels.map(x=>x.categoria))].sort().map(category=>{
  const group=byChannel.filter(ch=>ch.category===category);
  return {category,channels:group.length,sources:group.reduce((n,x)=>n+x.sourceCount,0),
    withCandidates:group.filter(x=>x.candidateCount>0).length,
    allProbesFailed:group.filter(x=>x.status==="all-probes-failed").length,
    empty:group.filter(x=>x.status==="no-sources").length};
}).sort((a,b)=>b.channels-a.channels);
const byHost=[...new Set(results.map(x=>x.host))].map(host=>{
  const rows=results.filter(x=>x.host===host);
  return {host,sources:rows.length,mediaCandidates:rows.filter(x=>candidates.has(x.result)).length,
    denied:rows.filter(x=>x.result==="access-denied").length,statuses:counts(rows,"result")};
}).sort((a,b)=>b.sources-a.sources);
const overview={checkedAt:new Date().toISOString(),source:"Saimo public TXT/M3U, GitHub Actions US runner",
  channels:channels.length,declaredSources:tasks.length,probedSources:results.length,uniqueHosts:byHost.length,
  noSources:channels.filter(x=>!x.fontes.length).length,
  mediaCandidates:results.filter(x=>candidates.has(x.result)).length,categories:byCategory,resultsByType:counts(results,"result"),
  cors:counts(results,"cors"),httpCodes:counts(results,"status"),
  note:"One ranged metadata GET per source from one US network; not playback confirmation. No media retained."};
const audit={overview,byHost,byChannel,sources:results.sort((a,b)=>a.id.localeCompare(b.id)||a.index-b.index)};
mkdirSync("artifacts",{recursive:true});
writeFileSync(reportPath,JSON.stringify(audit,null,2));
console.log(JSON.stringify({event:"overview",...overview}));
console.log(JSON.stringify({event:"top-hosts",hosts:byHost.slice(0,25)}));
for(const ch of byChannel)console.log(JSON.stringify({event:"channel",...ch}));
console.log(JSON.stringify({event:"complete",file:reportPath,durationS:Math.round((Date.now()-START)/1000)}));
