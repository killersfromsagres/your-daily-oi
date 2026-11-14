import {dataBrasilia,addDaysUTC,normalizeSoccerName,type JogoBrasileirao} from "./jogos-match";
import {broadcastTeamKey} from "./broadcast-verified";
export interface GuideBroadcast {casa:string;fora:string;inicioIso:string;dataLocal:string;names:string[];source:string}
const cache=new Map<string,{expires:number;rows:GuideBroadcast[]}>();
const pending=new Map<string,Promise<GuideBroadcast[]>>();
const guideTeamKey=(name:string)=>broadcastTeamKey(normalizeSoccerName(name));
const clean=(value:string)=>value.replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g," ").trim();
/** The public BR guide labels each fixture, channel and UTC kickoff separately. */
export function parseFootballTvGuide(html:string,source:string):GuideBroadcast[]{
 if(html.length>2_000_000)return [];
 const rows:GuideBroadcast[]=[];
 for(const article of html.matchAll(/<article\b([^>]*\bclass=["'][^"']*\bmatch\b[^"']*["'][^>]*)>([\s\S]*?)<\/article>/gi)){
  const stamp=/\bdata-ts=["'](\d{9,11})["']/.exec(article[1]||"")?.[1];if(!stamp)continue;
  const time=new Date(Number(stamp)*1000);if(!Number.isFinite(time.getTime()))continue;
  const body=article[2]||"",teams=[...body.matchAll(/<span\b[^>]*class=["'][^"']*\bm-name\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map(match=>clean(match[1]||""));
  const channelBlock=/<div\b[^>]*class=["'][^"']*\bm-channels\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(body)?.[1]||"";
  const names=[...new Set([...channelBlock.matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/gi)].map(match=>clean(match[1]||"")).filter(name=>name&&name.length<90))];
  if(teams.length!==2||!names.length)continue;
  rows.push({casa:teams[0]!,fora:teams[1]!,inicioIso:time.toISOString(),dataLocal:dataBrasilia(time),names,source});
 }
 return rows;
}
export function guideNamesForFixture(game:Pick<JogoBrasileirao,"casa"|"fora"|"inicioIso"|"dataLocal">,rows:readonly GuideBroadcast[]):string[]{
 const a=guideTeamKey(game.casa),b=guideTeamKey(game.fora),kickoff=Date.parse(game.inicioIso);
 const matching=rows.filter(row=>row.dataLocal===game.dataLocal&&Math.abs(Date.parse(row.inicioIso)-kickoff)<=45*60_000&&
  ((guideTeamKey(row.casa)===a&&guideTeamKey(row.fora)===b)||(guideTeamKey(row.casa)===b&&guideTeamKey(row.fora)===a)));
 return [...new Set(matching.flatMap(row=>row.names))];
}
export async function getGuideBroadcasts(date:string,now=new Date()):Promise<GuideBroadcast[]>{
 const today=dataBrasilia(now),tomorrow=addDaysUTC(today,1);
 if(date!==today&&date!==tomorrow)return [];
 const existing=cache.get(date);if(existing&&existing.expires>Date.now())return existing.rows;
 const running=pending.get(date);if(running)return running;
 const url=date===today?"https://www.futebolnatv.com.br/jogos-hoje/":"https://www.futebolnatv.com.br/jogos-amanha/";
 const task=(async()=>{
  try{
   const response=await fetch(url,{headers:{Accept:"text/html"},signal:AbortSignal.timeout(4500)});
   if(!response.ok)throw Error("Guide HTTP "+response.status);
   const rows=parseFootballTvGuide(await response.text(),url).filter(row=>row.dataLocal===date);
   cache.set(date,{rows,expires:Date.now()+(rows.length?10*60_000:60_000)});
   for(const key of cache.keys())if(key!==today&&key!==tomorrow)cache.delete(key);
   return rows;
  }catch(error){console.warn("[BroadcastGuide]",String(error).slice(0,150));return existing?.rows||[];}finally{pending.delete(date);}
 })();pending.set(date,task);return task;
}
