/** HTTP manifest/transport checks for channels reported by the user.
 * Does not decode or download copyrighted media, expose stream links,
 * bypass 403/DRM, or claim this proves playback on their TCL/ISP. */
import {buildLiveProxyPath} from "../src/lib/live-source.ts";
const base=(process.env.TV_AUDIT_ORIGIN||"https://zangflix.lovable.app").replace(/\/$/,"");
const names=["caz","band sports"];
async function catalog(){
  const response=await fetch(base+"/api/canais",{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("Canal catalog HTTP "+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload.canais))throw Error("Catalog is missing channels");
  return payload.canais;
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
    return {source:sourceIndex,status:response.status,mime,playlist,
      unexpectedHtml:/html/i.test(mime)};
  }catch(error){return {source:sourceIndex,error:error?.name||"NetworkError"}}
  finally{await reader?.cancel().catch(()=>{})}
}
try{
  const channels=await catalog();
  for(const search of names){
    const normalized=v=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const matching=channels.filter(ch=>normalized(ch.nome||"").includes(search));
    const channel=matching.find(ch=>ch.fontes?.length)||matching[0];
    if(!channel){console.log(JSON.stringify({event:"tv-channel-probe",search,found:false}));continue;}
    const count=Math.min(4,channel.fontes?.length||0);
    const checks=await Promise.all(Array.from({length:count},(_,i)=>probe(channel,i)));
    console.log(JSON.stringify({event:"tv-channel-probe",search,name:channel.nome,
      availableSources:channel.fontes?.length||0,checked:checks}));
  }
}catch(e){
  console.log(JSON.stringify({event:"tv-channel-probe-error",message:e?.message||String(e)}));
}
