/** Non-invasive quality audit of the actual published catalog. It probes
 * short source headers only: no video downloads and no signed URLs in logs.
 * In production, /api/qualidade serves every requested title on demand.
 */
import {probeExistingVodSources,declaredQuality} from "../src/lib/vod-quality-probe.ts";
const base=(process.env.VOD_AUDIT_ORIGIN||"https://zangflix.lovable.app").replace(/\/$/,"");
const perType=Math.max(0,Math.min(120,Number(process.env.VOD_AUDIT_PER_TYPE??"12")||12));
async function getJson(path){
  const res=await fetch(base+path,{signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}});
  if(!res.ok)throw Error("HTTP "+res.status);
  const data=await res.json();
  if(!data||typeof data!=="object")throw Error("Invalid API payload");
  return data;
}
const catalog=await getJson("/api/catalogo");
const items=Array.isArray(catalog.items)?catalog.items.filter(i=>i&&
  ["f","s","a"].includes(i.type)&&typeof i.id==="string"):[];
const total={f:0,s:0,a:0},withStreams={f:0,s:0,a:0},withDeclared={f:0,s:0,a:0};
const observed={f:0,s:0,a:0};
for(const item of items){
  total[item.type]++;
  const streams=Array.isArray(item.streams)?item.streams:[];
  if(streams.length)withStreams[item.type]++;
  if(streams.some(s=>declaredQuality(s)))withDeclared[item.type]++;
}
console.log(JSON.stringify({event:"vod-full-catalog-index",origin:new URL(base).host,
  total,withSourceLinks:withStreams,withDeclaredQuality:withDeclared,
  note:"A declared label is not measured. Some title sources are loaded only on the detail endpoint."}));
const stats={manifest:0,container:0,declared:0,cam:0,unknown:0,error:0};
for(const kind of ["f","s","a"]){
  const picks=items.filter(x=>x.type===kind).slice(0,perType);
  for(let offset=0;offset<picks.length;offset+=3){
    await Promise.all(picks.slice(offset,offset+3).map(async item=>{
      try{
        const detail=await getJson("/api/item?id="+encodeURIComponent(item.id)+
          "&tipo="+encodeURIComponent(kind));
        const ep=Array.isArray(detail.seasons)?detail.seasons.flatMap(s=>s.episodes||[])
          .find(e=>Array.isArray(e.streams)&&e.streams.length):null;
        const sources=kind==="f"?detail.streams||[]:ep?.streams||[];
        const finding=await probeExistingVodSources(sources);
        const evidence=finding?.evidence||"unknown";
        stats[evidence]=(stats[evidence]||0)+1;
        if(finding&&stats[evidence]<=6)
          console.log(JSON.stringify({event:"vod-audit-example",type:kind,
            id:String(item.id).slice(0,90),evidence,label:finding.label,
            season:ep?.seasonNumber||undefined,episode:ep?.episodeNumber||undefined}));
      }catch(e){stats.error++;}
    }));
  }
}
console.log(JSON.stringify({event:"vod-audit-summary",source:"live-provider-metadata",samplePerType:perType,
  itemsInspected:Object.values(stats).reduce((a,b)=>a+b,0),stats,
  note:"The sample does not prove every source plays. The runtime endpoint checks any requested catalog ID, with A VERIFICAR retained for inaccessible metadata."}));
