// src/lib/football-broadcasts.ts — Brazilian TV listings from TheSportsDB event-TV API.
// Only Brazil-tagged broadcasts may allocate a ZANG FLIX channel.
import type { JogoBrasileirao } from "./jogos-match";
import { matchImportance } from "./football-ranking";
const cache=new Map<string,{expires:number;names:string[]}>();
export type TvEvent={strCountry?:string|null;strChannel?:string|null;strEvent?:string|null;};
export function broadcastersForBrazil(rows:readonly TvEvent[]): string[] {
  return [...new Set(rows.filter(row =>
    /^(brazil|brasil|br)$/i.test((row.strCountry||"").trim())
  ).map(row=>(row.strChannel||"").trim()).filter(Boolean))];
}
async function lookup(game:JogoBrasileirao):Promise<string[]> {
  const id=game.id.replace(/^sportsdb:/,"");
  if(!/^\d{3,12}$/.test(id))return [];
  const cached=cache.get(id);
  if(cached&&cached.expires>Date.now())return cached.names;
  const url="https://www.thesportsdb.com/api/v1/json/123/lookuptv.php?id="+id;
  const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(3400)});
  if(!response.ok)throw new Error("TheSportsDB TV "+response.status);
  const body=await response.json() as {tvevent?:TvEvent[]|null};
  const names=broadcastersForBrazil(Array.isArray(body.tvevent)?body.tvevent:[]);
  cache.set(id,{expires:Date.now()+(names.length?5*60_000:2*60_000),names});
  if(cache.size>260)cache.delete(cache.keys().next().value!);
  return names;
}
/** Cap requests to respect public API limits. Other channels are never guessed. */
export async function getBrazilianSportsDbBroadcasts(
  games:readonly JogoBrasileirao[],
):Promise<Map<string,string[]>>{
  // Inspect national-team headlines and Brazil fixtures first, even when
  // the full day contains dozens of other games. The lookup runs again when
  // upcoming events enter the agenda's rolling window.
  const all=games.filter(g=>g.id.startsWith("sportsdb:")&&g.status!=="adiado"&&g.status!=="encerrado");
  const results=new Map<string,string[]>();const due=all.filter(g=>{const existing=cache.get(g.id.replace(/^sportsdb:/,""));if(existing&&existing.expires>Date.now()){if(existing.names.length)results.set(g.id,existing.names);return false;}return true;});
  const candidates=due.sort((a,b)=>(cache.get(a.id.replace(/^sportsdb:/,""))?.expires||0)-(cache.get(b.id.replace(/^sportsdb:/,""))?.expires||0)||matchImportance(b)-matchImportance(a)).slice(0,16);
  for(let i=0;i<candidates.length;i+=4){
    const batch=candidates.slice(i,i+4);const entries=await Promise.allSettled(batch.map(lookup));
    entries.forEach((entry,k)=>{const g=batch[k];if(!g)return;if(entry.status==="fulfilled"){if(entry.value.length)results.set(g.id,entry.value);}else cache.set(g.id.replace(/^sportsdb:/,""),{expires:Date.now()+2*60_000,names:[]});});
  }
  return results;
}
