/**
 * Manager attribution only from an independently matched SAME fixture,
 * never from the team's present-day roster (which could differ historically).
 */
import {photoFromSportsDbRecord} from "./lineup-photo-source";
import type {LineupCoach} from "./football-lineups";

const norm=(v:unknown)=>typeof v==="string"?v.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim():"";
const aliases:Record<string,string>={
  "sport club corinthians paulista":"corinthians","corinthians sp":"corinthians",
  "botafogo de futebol e regatas":"botafogo","botafogo rj":"botafogo",
  "sociedade esportiva palmeiras":"palmeiras","cr flamengo":"flamengo",
  "gremio foot ball porto alegrense":"gremio",
};
export function matchFixtureClub(a:string,b:string):boolean{
  const x=aliases[norm(a)]||norm(a),y=aliases[norm(b)]||norm(b);
  return !!x&&!!y&&x===y;
}
export interface LineupEventLike {
  idEvent?:string;dateEvent?:string;strTimestamp?:string;strSport?:string;
  strHomeTeam?:string;strAwayTeam?:string;
}
export function verifiedSameFixture(
  event:LineupEventLike,home:string,away:string,date:string,
):boolean {
  return !!date&&event.dateEvent===date&&
    (!event.strSport||/^(soccer|football)$/i.test(event.strSport))&&
    matchFixtureClub(event.strHomeTeam||"",home)&&matchFixtureClub(event.strAwayTeam||"",away);
}
interface CoachLineupRow {
  strPlayer?:string;strPosition?:string;strHome?:string;
  strTeam?:string;idPlayer?:string;strThumb?:string|null;strCutout?:string|null;strRender?:string|null;
}
export function eventManagers(
  entries:readonly CoachLineupRow[],home:string,away:string,
):Map<string,LineupCoach> {
  const found=new Map<string,LineupCoach>();
  const competing=new Set<string>();
  for(const row of entries){
    if(!/^(manager|coach|head coach|treinador|t[eé]cnico)$/i.test((row.strPosition||"").trim()))continue;
    const side=row.strHome==="Yes"?"home":row.strHome==="No"?"away":
      matchFixtureClub(row.strTeam||"",home)?"home":
      matchFixtureClub(row.strTeam||"",away)?"away":null;
    if(!side||!row.strPlayer?.trim())continue;
    if(found.has(side)){competing.add(side);continue;}
    found.set(side,{name:row.strPlayer.trim().slice(0,85),
      photo:photoFromSportsDbRecord(row),
      id:/^\d{1,12}$/.test(String(row.idPlayer||""))?String(row.idPlayer):null});
  }
  for(const side of competing)found.delete(side);
  return found;
}
const store=new Map<string,{until:number;results:Map<string,LineupCoach>}>();
export async function loadVerifiedEventCoaches(input:{
  home:string;away:string;date:string;
}):Promise<Map<string,LineupCoach>> {
  const empty=()=>new Map<string,LineupCoach>();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!input.home||!input.away)return empty();
  const key=input.date+":"+norm(input.home)+":"+norm(input.away);
  const hit=store.get(key);
  if(hit && hit.until>Date.now())return hit.results;
  try{
    const query=new URL("https://www.thesportsdb.com/api/v1/json/123/searchevents.php");
    query.searchParams.set("e",input.home+"_vs_"+input.away);
    const response=await fetch(query,{signal:AbortSignal.timeout(2400),headers:{Accept:"application/json"}});
    if(!response.ok)return empty();
    const json=await response.json() as {event?:LineupEventLike[]|null;events?:LineupEventLike[]|null};
    const events=Array.isArray(json.event)?json.event:Array.isArray(json.events)?json.events:[];
    const matches=events.filter(evt=>verifiedSameFixture(evt,input.home,input.away,input.date));
    if(matches.length!==1||!/^\d{3,12}$/.test(String(matches[0]?.idEvent||"")))return empty();
    const result=await fetch("https://www.thesportsdb.com/api/v1/json/123/lookuplineup.php?id="+
      matches[0]!.idEvent,{signal:AbortSignal.timeout(2400),headers:{Accept:"application/json"}});
    if(!result.ok)return empty();
    const rows=await result.json() as {lineup?:CoachLineupRow[]|null};
    const managers=eventManagers(rows.lineup||[],input.home,input.away);
    if(store.size>80)store.delete(store.keys().next().value!);
    store.set(key,{until:Date.now()+15*60_000,results:managers});
    return managers;
  }catch{return empty();}
}
