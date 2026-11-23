import {qualityKey,type MediaQualityBadgeInfo,type MediaQualityKey} from "./verified-media-quality";
interface QualityResponse{
  type:string;id:string;checkedAt:number;
  sampledEpisode?:{season:number;episode:number};
  finding:(MediaQualityBadgeInfo&{evidence?:string})|null;
}
const cache=new Map<string,{value:MediaQualityBadgeInfo|null;expires:number}>();
const pending=new Map<string,Promise<MediaQualityBadgeInfo|null>>();
const queue:(()=>void)[]=[];
let running=0;
const MAX_PARALLEL=3;
function flush(){
  while(running<MAX_PARALLEL&&queue.length){
    const next=queue.shift();
    if(!next)break;
    running++;next();
  }
}
function schedule<T>(fn:()=>Promise<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    queue.push(()=>{
      void fn().then(resolve,reject).finally(()=>{running--;flush()});
    });
    flush();
  });
}
export function requestCatalogQuality(key:MediaQualityKey):Promise<MediaQualityBadgeInfo|null>{
  if(!key.id)return Promise.resolve(null);
  const id=qualityKey(key);
  const known=cache.get(id);
  if(known?.expires&&known.expires>Date.now())return Promise.resolve(known.value);
  const inflight=pending.get(id);
  if(inflight)return inflight;
  const task=schedule(async()=>{
    try{
      const params=new URLSearchParams({tipo:key.type,id:key.id});
      if(key.season!==undefined&&key.episode!==undefined){
        params.set("temp",String(key.season));params.set("ep",String(key.episode));
      }
      const response=await fetch("/api/qualidade?"+params.toString(),{
        cache:"no-store",signal:AbortSignal.timeout(11500),
      });
      if(!response.ok)throw Error("Quality API unavailable");
      const result=await response.json() as QualityResponse;
      if(result.id!==key.id||result.type!==key.type)throw Error("Unexpected quality identity");
      const finding=result.finding;
      const value=finding&&typeof finding.label==="string"&&
        ["4k","qhd","fullhd","hd","sd","low","cam"].includes(finding.tier)
          ? {label:key.type!=="f"&&key.episode===undefined&&result.sampledEpisode
              ?finding.label+" · EP. "+result.sampledEpisode.episode:finding.label,
             tier:finding.tier,verified:false,detail:finding.detail}
          :null;
      if(cache.size>=500)cache.delete(cache.keys().next().value!);
      cache.set(id,{value,expires:Date.now()+(value?60*60*1000:10*60*1000)});
      return value;
    }catch{
      // Older Lovable deploys may not yet contain the new endpoint; don't
      // hammer every poster with retries.
      cache.set(id,{value:null,expires:Date.now()+7*60*1000});
      return null;
    }
  });
  pending.set(id,task);
  void task.finally(()=>pending.delete(id));
  return task;
}
