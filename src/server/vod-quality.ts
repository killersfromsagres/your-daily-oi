import {loadCatalog,getStreamsForItem,getSeasonsForSeries} from "../lib/catalog";
import type {CatalogItem,StreamSource,EpisodeItem} from "../lib/types";
import {qualityKey,type MediaKind,type MediaQualityKey} from "../lib/verified-media-quality";
import {probeExistingVodSources,type SourceQualityFinding} from "../lib/vod-quality-probe";

export interface RemoteMediaQuality {
  type:MediaKind;id:string;season?:number;episode?:number;
  finding:SourceQualityFinding|null;checkedAt:number;
  sampledEpisode?:{season:number;episode:number};
}
const cache=new Map<string,{expires:number,data:RemoteMediaQuality}>();
const pending=new Map<string,Promise<RemoteMediaQuality>>();
const READY_TTL=8*60*60*1000,EMPTY_TTL=12*60*1000;
export function validateMediaQualityKey(type:string|null,id:string|null,
  season:string|null,episode:string|null):MediaQualityKey|null{
  if(!["f","s","a"].includes(type||"")||!id||
     id.length>160||!/^[\w.-]+$/.test(id))return null;
  if(season!==null&&(!/^\d{1,3}$/.test(season)||Number(season)>99))return null;
  if(episode!==null&&(!/^\d{1,4}$/.test(episode)||Number(episode)>2000))return null;
  if((season===null)!==(episode===null))return null;
  return {type:type as MediaKind,id,
    ...(season!==null?{season:Number(season),episode:Number(episode)}:{})};
}
function findItem(items:Map<string,CatalogItem>,input:MediaQualityKey):CatalogItem|null{
  const fromKey=items.get(input.id);
  if(fromKey?.type===input.type)return fromKey;
  // Catalog aliases and prefixed IDs can differ; never accept a cross-type match.
  return [...items.values()].find(item=>item.id===input.id&&item.type===input.type)??null;
}
async function sourceList(item:CatalogItem,key:MediaQualityKey):
Promise<{sources:StreamSource[];sampledEpisode?:{season:number;episode:number}}>{
  if(key.type==="f"){
    const streams=item.streams.length?item.streams:
      await getStreamsForItem("f",item.catalogTitle||item.title,item);
    return {sources:streams};
  }
  let seasons=item.seasons||[];
  if(!seasons.length){
    seasons=await getSeasonsForSeries(item.catalogTitle||item.title,key.type);
    if(key.type==="a"&&!seasons.length)
      seasons=await getSeasonsForSeries(item.catalogTitle||item.title,"s");
  }
  const first=seasons.flatMap(s=>s.episodes||[])
    .sort((a,b)=>a.seasonNumber-b.seasonNumber||a.episodeNumber-b.episodeNumber)[0];
  const selected:EpisodeItem|undefined=key.season!==undefined&&key.episode!==undefined
    ?seasons.find(season=>season.seasonNumber===key.season)
      ?.episodes.find(ep=>ep.episodeNumber===key.episode)
    :first;
  return {sources:selected?.streams||[],...(selected?{
    sampledEpisode:{season:selected.seasonNumber,episode:selected.episodeNumber},
  }:{})};
}
export async function checkCatalogMediaQuality(key:MediaQualityKey):Promise<RemoteMediaQuality|null>{
  const cacheKey=qualityKey(key),now=Date.now();
  const existing=cache.get(cacheKey);
  if(existing&&existing.expires>now)return existing.data;
  const inProgress=pending.get(cacheKey);
  if(inProgress)return inProgress;
  const task=(async()=>{
    const {items}=await loadCatalog();
    const item=findItem(items,key);
    if(!item)return null;
    let finding:SourceQualityFinding|null=null;
    let sampledEpisode:{season:number;episode:number}|undefined;
    try{
      const sources=await sourceList(item,key);
      sampledEpisode=sources.sampledEpisode;
      finding=await probeExistingVodSources(sources.sources);
      if(finding&&sampledEpisode&&key.type!=="f"&&key.episode===undefined){
        finding={...finding,detail:
          "Amostra: temporada "+sampledEpisode.season+", episódio "+sampledEpisode.episode+
          ". "+finding.detail+" Outros episódios podem ter resolução diferente."};
      }
    }catch{/* A failed metadata probe must never affect video playback. */}
    const result:RemoteMediaQuality={type:key.type,id:key.id,
      ...(key.season!==undefined&&key.episode!==undefined?{season:key.season,episode:key.episode}:{}),
      finding,checkedAt:Date.now(),...(sampledEpisode?{sampledEpisode}:{})};
    if(cache.size>2400){
      for(const [k,v] of cache){if(v.expires<Date.now())cache.delete(k);}
      if(cache.size>2400)cache.delete(cache.keys().next().value!);
    }
    cache.set(cacheKey,{expires:Date.now()+(finding?READY_TTL:EMPTY_TTL),data:result});
    return result;
  })();
  // Cache inflight requests to prevent 100 cards probing the same title.
  pending.set(cacheKey,task as Promise<RemoteMediaQuality>);
  try{return await task}finally{pending.delete(cacheKey)}
}
export async function mediaQualityApi(url:URL):Promise<Response>{
  const key=validateMediaQualityKey(url.searchParams.get("tipo"),url.searchParams.get("id"),
    url.searchParams.get("temp"),url.searchParams.get("ep"));
  if(!key)return Response.json({error:"Identificador de mídia inválido"}, {status:400});
  const value=await checkCatalogMediaQuality(key);
  if(!value)return Response.json({error:"Título não encontrado"}, {status:404});
  // Never reveal the source URL, signed tokens, manifest bytes or provider keys.
  return new Response(JSON.stringify(value),{
    headers:{"Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"private, max-age=300"},
  });
}
