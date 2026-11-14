import {buildLiveProxyPath,classifyLiveSource} from "./live-source";
import type {FonteTV} from "./canais";
export interface CastCandidate{url:string;mime:string}
export function castMime(source:FonteTV|undefined):string|null{
 if(!source||source.chave)return null;
 const kind=classifyLiveSource(source);
 if(kind==="ts")return null;
 return kind==="dash"?"application/dash+xml":kind==="mp4"?"video/mp4":"application/x-mpegURL";
}
/** TV receivers fetch independently. Use the public CORS proxy, never blob/local URLs or external keys. */
export function liveCastCandidates(options:{origin:string;channelId:string;source:FonteTV|undefined;streamUrl:string;sources:FonteTV[]}):CastCandidate[]{
 const result:CastCandidate[]=[],seen=new Set<string>();
 const add=(value:string,mime:string|null)=>{
  if(!mime)return;
  try{const url=new URL(value,options.origin);
   if(url.protocol!=="https:"||url.username||url.password||/^(localhost|127\.|192\.168\.|10\.|169\.254\.)/.test(url.hostname))return;
   if(seen.has(url.href))return;seen.add(url.href);result.push({url:url.href,mime});
  }catch{}
 };
 if(options.source){
  const i=options.sources.findIndex(source=>source.url===options.source?.url);
  if(i>=0)add(buildLiveProxyPath(options.channelId,i,options.source,true),castMime(options.source));
  add(options.streamUrl,castMime(options.source));
 }
 for(const [i,source] of options.sources.entries()){
  if(source===options.source)continue;
  add(buildLiveProxyPath(options.channelId,i,source,true),castMime(source));
 }
 return result.slice(0,4);
}
