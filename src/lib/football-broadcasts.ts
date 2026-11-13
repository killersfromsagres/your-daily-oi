// src/lib/football-broadcasts.ts — Brazilian TV listings from TheSportsDB event-TV API.
// Only Brazil-tagged broadcasts may allocate a ZANG FLIX channel.
import type { JogoBrasileirao } from "./jogos-match";
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
  cache.set(id,{expires:Date.now()+20*60_000,names});
  if(cache.size>260)cache.delete(cache.keys().next().value!);
  return names;
}
/** Cap requests to respect public API limits. Other channels are never guessed. */
export async function getBrazilianSportsDbBroadcasts(
  games:readonly JogoBrasileirao[],
):Promise<Map<string,string[]>>{
  const candidates=games.filter(g=>g.id.startsWith("sportsdb:"))
    .sort((a,b)=>Number(b.destaque)-Number(a.destaque))
    .slice(0,10);
  const results=new Map<string,string[]>();
  for(let i=0;i<candidates.length;i+=5){
    const batch=candidates.slice(i,i+5);
    const entries=await Promise.allSettled(batch.map(lookup));
    entries.forEach((entry,k)=>{
      if(entry.status==="fulfilled"&&entry.value.length&&batch[k])
        results.set(batch[k].id,entry.value);
    });
  }
  return results;
}
