// ESPN soccer standings normalized for client and server.
import { LIGAS_FUTEBOL } from "./jogos-match";

export const TABLE_LEAGUES = LIGAS_FUTEBOL.filter(liga => [
  "bra.1","bra.2","bra.copa_do_brazil","eng.1","esp.1","ita.1","ger.1","fra.1","por.1",
  "uefa.champions","conmebol.libertadores","conmebol.sudamericana","uefa.europa",
].includes(liga.id));
export type StandingsRow = {
  id:string; position:number; name:string; abbreviation:string; logo:string|null;
  points:number|null; played:number|null; won:number|null; drawn:number|null; lost:number|null;
  goalDifference:number|null; form:string|null; note:string|null;
};
export type StandingsGroup = { id:string; name:string; rows:StandingsRow[] };
export interface StandingsResponse {
  ligaId:string; liga:string; temporada:string|null; atualizadoEm:string;
  grupos:StandingsGroup[]; parcial?:boolean; erro?:string;
}
type RawStats = {name?:string;type?:string;abbreviation?:string;value?:number;displayValue?:string};
type RawEntry = {team?:{id?:string;displayName?:string;name?:string;abbreviation?:string;logo?:string;logos?:{href?:string}[]};
 stats?:RawStats[];note?:{description?:string}};
type RawGroup = {id?:string;name?:string;abbreviation?:string;standings?:{entries?:RawEntry[]}};
type StandingsPayload = {season?:{displayName?:string;year?:number};children?:RawGroup[];standings?:{entries?:RawEntry[]}};
const safeLogo=(url?:string):string|null=>{
  try {const parsed=new URL(url||"");return parsed.protocol==="https:"?parsed.href:null;}catch{return null;}
};
function getStat(stats:RawStats[],names:string[]):RawStats|undefined {
  return stats.find(s=>names.includes((s.name||s.type||"").toLowerCase())) ||
    stats.find(s=>names.some(name=>name===(s.abbreviation||"").toLowerCase()));
}
const numeric=(stats:RawStats[], names:string[]):number|null=>{
  const raw=getStat(stats,names);
  if(!raw)return null;
  const value=typeof raw.value==="number"?raw.value:Number(raw.displayValue);
  return Number.isFinite(value)?value:null;
};
function parseRows(entries:RawEntry[]):StandingsRow[] {
  return entries.map((entry,index)=>{
    const team=entry.team,stats=entry.stats||[];
    const name=team?.displayName||team?.name||"Equipe";
    const rank=numeric(stats,["rank","position"]);
    return {
      id:team?.id||name+"-"+index,position:rank!==null&&rank>0?rank:index+1,
      name, abbreviation:team?.abbreviation||name.slice(0,3).toUpperCase(),
      logo:safeLogo(team?.logos?.[0]?.href||team?.logo),
      points:numeric(stats,["points","point"]),
      played:numeric(stats,["gamesplayed","played","games"]),
      won:numeric(stats,["wins","won"]),
      drawn:numeric(stats,["ties","draws","drawn"]),
      lost:numeric(stats,["losses","lost"]),
      goalDifference:numeric(stats,["pointdifferential","goaldifference","goaldiff"]),
      form:getStat(stats,["streak","form","lastfive","last5"])?.displayValue||null,
      note:typeof entry.note?.description==="string"?entry.note.description:null,
    };
  }).sort((a,b)=>a.position-b.position);
}
export function parseSoccerStandings(raw:unknown,leagueId:string,now=new Date()):StandingsResponse {
  const league=TABLE_LEAGUES.find(l=>l.id===leagueId);
  if(!league)throw new RangeError("Campeonato não suportado");
  if(!raw||typeof raw!=="object")throw new Error("Classificação inválida");
  const data=raw as StandingsPayload;
  const sourceGroups:RawGroup[]=data.children?.length?data.children:[{name:"Classificação geral",...(data.standings?{standings:data.standings}:{})}];
  const groups=sourceGroups.map((item,index)=>({
      id:item.id||String(index),name:item.name||item.abbreviation||"Classificação geral",
      rows:parseRows(Array.isArray(item.standings?.entries)?item.standings!.entries!:[]),
    })).filter(g=>g.rows.length>0);
  if(!groups.length)throw new Error("Tabela ainda não publicada para esta competição");
  const temporada=data.season?.displayName||(data.season?.year?String(data.season.year):null);
  return {ligaId:league.id,liga:league.name,temporada,atualizadoEm:now.toISOString(),grupos:groups};
}
const tableCache=new Map<string,{expires:number;created:number;data:StandingsResponse}>();
const pending=new Map<string,Promise<StandingsResponse>>();
export async function getLeagueStandings(leagueId:string):Promise<StandingsResponse> {
  if(!TABLE_LEAGUES.some(l=>l.id===leagueId))throw new RangeError("Campeonato não suportado");
  const cache=tableCache.get(leagueId),now=Date.now();
  if(cache&&cache.expires>now)return cache.data;
  const current=pending.get(leagueId);
  if(current)return current;
  const task=(async()=>{
    try {
      const response=await fetch("https://site.api.espn.com/apis/v2/sports/soccer/"+
        encodeURIComponent(leagueId)+"/standings",{
          headers:{Accept:"application/json"},signal:AbortSignal.timeout(8500),
        });
      if(!response.ok)throw new Error("ESPN HTTP "+response.status);
      const result=parseSoccerStandings(await response.json(),leagueId);
      tableCache.set(leagueId,{data:result,created:Date.now(),expires:Date.now()+10*60_000});
      if(tableCache.size>16)for(const key of tableCache.keys())if(key!==leagueId)tableCache.delete(key);
      return result;
    }catch(error){
      if(cache&&now-cache.created<12*60*60_000){
        return {...cache.data,parcial:true,erro:"Dados anteriores: tabela temporariamente indisponível"};
      }
      throw error;
    }
  })().finally(()=>pending.delete(leagueId));
  pending.set(leagueId,task);
  return task;
}
