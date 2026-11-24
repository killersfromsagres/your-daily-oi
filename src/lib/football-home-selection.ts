import {matchImportance,isBrazilFixture} from "./football-ranking";
import {webBroadcastState} from "./web-broadcast-state";
import type {JogoBrasileirao} from "./jogos-match";
const priority=new Set(["bra.1","uefa.champions","conmebol.libertadores","bra.copa_do_brazil","eng.1","esp.1","uefa.europa","conmebol.sudamericana"]);
/** Today's verified broadcasts only. The full schedule retains all other fixtures. */
export function homeFootballMatches(games:readonly JogoBrasileirao[],day:string,now:number,limit=6,allowOfficial=true):JogoBrasileirao[]{
 const unique=new Map<string,JogoBrasileirao>();
 for(const g of games){
  if(g.dataLocal!==day||!Number.isFinite(Date.parse(g.inicioIso)))continue;
  const state=webBroadcastState(g,now);
  if(!state.internal&&!(allowOfficial&&state.official))continue;
  unique.set(g.id,g);
 }
 const rank=(g:JogoBrasileirao)=>{
  const delta=Date.parse(g.inicioIso)-now;
  return (g.status==="ao-vivo"?100000:0)+(isBrazilFixture(g)?9000:0)+(priority.has(g.ligaId)?1500:0)+matchImportance(g)+(now>0&&delta>=0&&delta<=2*3600000?500:0);
 };
 return [...unique.values()].sort((a,b)=>rank(b)-rank(a)||Date.parse(a.inicioIso)-Date.parse(b.inicioIso)||a.id.localeCompare(b.id)).slice(0,Math.max(0,Math.min(6,Math.floor(limit))));
}
