/** HTTP manifest/transport checks for channels reported by the user.
 * Does not decode or download copyrighted media, expose stream links,
 * bypass 403/DRM, or claim this proves playback on their TCL/ISP. */
import {buildLiveProxyPath} from "../src/lib/live-source.ts";
const base=(process.env.TV_AUDIT_ORIGIN||"https://zangflix.lovable.app").replace(/\/$/,"");
const names=["caze tv (st)","band sports hd"];
async function catalog(){
  const response=await fetch(base+"/api/canais",{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("Canal catalog HTTP "+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.canais))throw Error("Catalog is missing channels");
  return payload.canais;
}
const shortText=async(url)=>{
  const response=await fetch(url,{signal:AbortSignal.timeout(6500),
    headers:{Accept:"application/vnd.apple.mpegurl,*/*",Range:"bytes=0-32767"}});
  if(!response.ok)return {status:response.status,mime:response.headers.get("content-type")||"",text:""};
  const reader=response.body?.getReader();
  let body="";
  try{
    for(let i=0;i<5;i++){
      const chunk=await reader?.read();
      if(!chunk||chunk.done)break;
      body+=new TextDecoder().decode(chunk.value);
      if(body.length>30000)break;
    }
  }finally{await reader?.cancel().catch(()=>{})}
  return {status:response.status,mime:response.headers.get("content-type")||"",text:body};
};
async function checkSegments(path){
  const original=new URL(path,base);
  if(original.origin!==new URL(base).origin)return {detail:"external"};
  let current=original;
  for(let depth=0;depth<2;depth++){
    const response=await shortText(current);
    if(response.status!==200&&response.status!==206)return {manifest:response.status};
    const lines=response.text.split(/\r?\n/).map(s=>s.trim());
    if(!lines[0]?.startsWith("#EXTM3U"))return {manifest:response.status,playlist:false};
    const first=lines.find(line=>line.length&&!line.startsWith("#"));
    if(!first)return {manifest:response.status,playlist:true,segment:"none"};
    const url=new URL(first,current);
    if(url.origin!==original.origin)return {manifest:response.status,playlist:true,segment:"external"};
    if(/\.m3u8?(?:\?|$)/i.test(url.pathname)||response.text.includes("#EXT-X-STREAM-INF")){
      current=url;continue;
    }
    try{
      const r=await fetch(url,{signal:AbortSignal.timeout(7000),
        headers:{Range:"bytes=0-1023"},redirect:"manual"});
      const result={manifest:response.status,playlist:true,segmentStatus:r.status,
        segmentMime:(r.headers.get("content-type")||"").split(";")[0]};
      await r.body?.cancel().catch(()=>{});
      return result;
    }catch(e){return {manifest:response.status,playlist:true,segmentError:e?.name||"timeout"}}
  }
  return {manifest:200,playlist:true,segment:"nested-playlist"};
}
async function probe(channel,sourceIndex){
  const source=channel.fontes[sourceIndex];
  const path=buildLiveProxyPath(channel.id,sourceIndex,source,true);
  let reader;
  try{
    const response=await fetch(base+path,{
      headers:{Range:"bytes=0-2047",Accept:"application/vnd.apple.mpegurl,*/*"},
      redirect:"manual",signal:AbortSignal.timeout(7000),
    });
    const mime=(response.headers.get("content-type")||"").split(";")[0];
    let sample="";
    if(response.body){
      reader=response.body.getReader();
      const part=await reader.read();
      if(part.value?.length)sample=new TextDecoder().decode(part.value.slice(0,256));
      await reader.cancel().catch(()=>{});
    }
    const playlist=sample.trimStart().startsWith("#EXTM3U");
    const segments=playlist?await checkSegments(base+path):null;
    return {source:sourceIndex,status:response.status,mime,playlist,
      segments,unexpectedHtml:/html/i.test(mime)};
  }catch(error){return {source:sourceIndex,error:error?.name||"NetworkError"}}
  finally{await reader?.cancel().catch(()=>{})}
}
try{
  const channels=await catalog();
  for(const search of names){
    const normalized=v=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const matching=channels.filter(ch=>normalized(ch.nome||"").includes(search.replace(" (st)",""))||
      (search.startsWith("caze")&&normalized(ch.nome||"").includes("caze")));
    const exact=matching.find(ch=>normalized(ch.nome||"")===search);
    const channel=exact||matching.find(ch=>ch.fontes?.length)||matching[0];
    if(!channel){console.log(JSON.stringify({event:"tv-channel-probe",search,found:false}));continue;}
    const count=Math.min(4,channel.fontes?.length||0);
    const checks=await Promise.all(Array.from({length:count},(_,i)=>probe(channel,i)));
    console.log(JSON.stringify({event:"tv-channel-probe",search,name:channel.nome,
      matchingNames:matching.map(ch=>ch.nome).slice(0,12),
      availableSources:channel.fontes?.length||0,checked:checks}));
  }
}catch(e){
  console.log(JSON.stringify({event:"tv-channel-probe-error",message:e?.message||String(e)}));
}
