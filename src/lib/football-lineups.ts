// src/lib/football-lineups.ts — ESPN match rosters + TheSportsDB lineup, server-only.
// Never invent starters/coach/photos before the provider releases the lineup.
import { LIGAS_FUTEBOL } from "./jogos-match";
export type PlayerPosition="GOL"|"DEF"|"MEI"|"ATA";
export interface LineupPlayer {
  id:string;name:string;number:string|null;position:string;
  group:PlayerPosition;photo:string|null;grid:string|null;
}
export interface LineupCoach {name:string;photo:string|null;}
export interface LineupTeam {
  name:string;formation:string|null;crest:string|null;
  coach:LineupCoach|null;starting:LineupPlayer[];substitutes:LineupPlayer[];
}
export interface MatchLineups {
  jogo:string;atualizadoEm:string;disponivel:boolean;completa:boolean;
  origem:"ESPN"|"TheSportsDB";equipes:LineupTeam[];
  mensagem:string;
}
function safePhoto(input:unknown):string|null {
  if(typeof input!=="string")return null;
  try {const url=new URL(input);return url.protocol==="https:"?url.href:null;}
  catch{return null;}
}
function nameOf(v:unknown):string {
  return typeof v==="string"?v.trim().slice(0,85):"";
}
export function groupPosition(raw:string):PlayerPosition {
  const p=raw.toLowerCase();
  if(/goal|goleir|keeper|\bgk\b|\bgl\b|portero|torwart/.test(p))return "GOL";
  if(/defend|zagueir|lateral|back|\bcb\b|\blb\b|\brb\b|\bdf\b/.test(p))return "DEF";
  if(/attac|forward|strik|atacant|ponta|winger|\bst\b|\bfw\b|\bcf\b/.test(p))return "ATA";
  return "MEI";
}
type SportsDbLine = {
  idLineup?:string;idPlayer?:string;strPlayer?:string;strTeam?:string;
  strHome?:string;strSubstitute?:string;strPosition?:string;
  intSquadNumber?:number|string|null;strCutout?:string|null;strThumb?:string|null;
  strRender?:string|null;strFormation?:string|null;strTeamBadge?:string|null;
};
export function parseSportsDbLineups(jogo:string,raw:SportsDbLine[]):MatchLineups {
  const groups=new Map<string,LineupTeam>();
  for(const entry of raw){
    const name=nameOf(entry.strPlayer);
    const side=entry.strHome==="Yes"?"home":entry.strHome==="No"?"away":nameOf(entry.strTeam)||"unknown";
    const teamName=nameOf(entry.strTeam)|| (side==="home"?"Mandante":"Visitante");
    if(!groups.has(side))groups.set(side,{name:teamName,formation:null,crest:safePhoto(entry.strTeamBadge),coach:null,starting:[],substitutes:[]});
    const team=groups.get(side)!;
    if(entry.strFormation&&!team.formation)team.formation=nameOf(entry.strFormation);
    const role=nameOf(entry.strPosition);
    if(!name)continue;
    const photo=safePhoto(entry.strCutout)||safePhoto(entry.strThumb)||safePhoto(entry.strRender);
    if(/manager|head coach|treinador|t[eé]cnico|coach/i.test(role)){
      team.coach={name,photo};
      continue;
    }
    const player:LineupPlayer={
      id:String(entry.idPlayer||entry.idLineup||name),
      name,number:entry.intSquadNumber==null?null:String(entry.intSquadNumber),
      position:role||"Posição não informada",group:groupPosition(role),photo,grid:null,
    };
    if(entry.strSubstitute==="No")team.starting.push(player);
    else if(entry.strSubstitute==="Yes")team.substitutes.push(player);
  }
  const teams=[...groups.values()].slice(0,2);
  const available=teams.some(t=>t.starting.length>0);
  const complete=teams.length===2 && teams.every(t=>t.starting.length===11);
  return {
    jogo,atualizadoEm:new Date().toISOString(),disponivel:available,completa:complete,
    origem:"TheSportsDB",equipes:teams,
    mensagem:!available?"Aguardando divulgação das escalações oficiais."
      :!complete?"Escalação parcial: o provedor ainda não liberou todos os titulares.":"Escalações disponíveis.",
  };
}
type ESPNPlayer={
  athlete?:{id?:string;displayName?:string;fullName?:string;headshot?:{href?:string}|string};
  position?:{name?:string;displayName?:string;abbreviation?:string};
  jersey?:string|number;formationPlace?:string|number|null;
  starter?:boolean;starting?:boolean;isStarter?:boolean;
};
type ESPNTeam={
  team?:{id?:string;displayName?:string;name?:string;logo?:string};
  roster?:ESPNPlayer[];coach?:{displayName?:string;name?:string;headshot?:{href?:string}|string};
  coaches?:Array<{displayName?:string;name?:string;headshot?:{href?:string}|string}>;
  formation?:string;
};
type ESPNSummary={
  rosters?:ESPNTeam[];
  boxscore?:{form?:Array<{team?:{displayName?:string;logo?:string};formation?:string;coach?:{name?:string;displayName?:string;headshot?:{href?:string}}}>};
};
function headshot(athlete:ESPNPlayer["athlete"]):string|null {
  const photo=athlete?.headshot;
  if(typeof photo==="string")return safePhoto(photo);
  return safePhoto(photo?.href)||
    (/^\d+$/.test(athlete?.id||"")?
      "https://a.espncdn.com/i/headshots/soccer/players/full/"+athlete!.id+".png":null);
}
export function parseESPNLineups(jogo:string,raw:ESPNSummary):MatchLineups {
  const teams=(Array.isArray(raw.rosters)?raw.rosters:[]).slice(0,2).map((item,index):LineupTeam=>{
    const form=raw.boxscore?.form?.[index];
    const coach=item.coach||item.coaches?.[0]||form?.coach;
    const crew:LineupCoach|null=coach&&nameOf(coach.displayName||coach.name)?
      {name:nameOf(coach.displayName||coach.name),photo:typeof coach.headshot==="string"
        ?safePhoto(coach.headshot):safePhoto(coach.headshot?.href)}:null;
    const roster=Array.isArray(item.roster)?item.roster:[];
    const players=roster.filter(p=>p.athlete?.id&&nameOf(p.athlete?.displayName||p.athlete?.fullName))
      .map((p):{player:LineupPlayer;starter:boolean}=>{
        const label=nameOf(p.position?.name||p.position?.displayName||p.position?.abbreviation)||"Posição não informada";
        return {player:{
          id:String(p.athlete!.id),name:nameOf(p.athlete?.displayName||p.athlete?.fullName),
          number:p.jersey==null?null:String(p.jersey),position:label,
          group:groupPosition(label),photo:headshot(p.athlete),
          grid:p.formationPlace==null?null:String(p.formationPlace),
        },starter:p.starter===true||p.starting===true||p.isStarter===true||
          // ESPN frequently assigns formationPlace=0 to *every substitute*.
          // Checking for non-null put entire 25-player squads on the pitch.
          (p.formationPlace!==undefined&&p.formationPlace!==null&&
            /^\d+(?::\d+)?$/.test(String(p.formationPlace))&&
            Number(String(p.formationPlace).split(":")[0])>0)};
      });
    return {
      name:nameOf(item.team?.displayName||item.team?.name||form?.team?.displayName)||"Equipe",
      formation:nameOf(item.formation||form?.formation)||null,
      crest:safePhoto(item.team?.logo||form?.team?.logo),coach:crew,
      // Never render more than eleven as confirmed. A malformed provider
      // payload is treated as pending, not sliced into a fictional starting XI.
      starting:players.filter(p=>p.starter).length<=11
        ?players.filter(p=>p.starter).map(p=>p.player):[],
      substitutes:players.filter(p=>!p.starter).map(p=>p.player),
    };
  });
  const available=teams.some(t=>t.starting.length>0),complete=teams.length===2&&teams.every(t=>t.starting.length===11);
  return {
    jogo,atualizadoEm:new Date().toISOString(),disponivel:available,completa:complete,
    origem:"ESPN",equipes:teams,
    mensagem:!available?"Escalações ainda não divulgadas para esta partida."
      :!complete?"Escalação parcial; aguardando confirmação dos titulares restantes.":"Escalações disponíveis.",
  };
}
const cache=new Map<string,{until:number;data:MatchLineups}>();
const inflight=new Map<string,Promise<MatchLineups>>();
export function validLineupId(id:string):boolean {
  if(/^sportsdb:\d{3,12}$/.test(id))return true;
  const i=id.lastIndexOf(":");
  return i>0&&/^\d{3,12}$/.test(id.slice(i+1))&&
    LIGAS_FUTEBOL.some(x=>x.id===id.slice(0,i));
}
export async function getMatchLineups(jogo:string):Promise<MatchLineups>{
  if(!validLineupId(jogo))throw new RangeError("Partida inválida");
  const cached=cache.get(jogo);
  if(cached && cached.until>Date.now())return cached.data;
  const pending=inflight.get(jogo);
  if(pending)return pending;
  const work=(async()=>{
    let payload:MatchLineups;
    if(jogo.startsWith("sportsdb:")){
      const fixtureId=jogo.slice("sportsdb:".length);
      const response=await fetch("https://www.thesportsdb.com/api/v1/json/123/lookuplineup.php?id="+fixtureId,{
        signal:AbortSignal.timeout(5500),headers:{Accept:"application/json"},
      });
      if(!response.ok)throw new Error("TheSportsDB lineup HTTP "+response.status);
      const json=await response.json() as {lineup?:SportsDbLine[]|null};
      payload=parseSportsDbLineups(jogo,Array.isArray(json.lineup)?json.lineup:[]);
    }else{
      const idx=jogo.lastIndexOf(":"), league=jogo.slice(0,idx), event=jogo.slice(idx+1);
      const url="https://site.api.espn.com/apis/site/v2/sports/soccer/"+
        encodeURIComponent(league)+"/summary?event="+encodeURIComponent(event);
      const response=await fetch(url,{signal:AbortSignal.timeout(5500),headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("ESPN lineup HTTP "+response.status);
      const json=await response.json() as ESPNSummary;
      payload=parseESPNLineups(jogo,json);
    }
    // Announced lineups refresh quickly before kickoff, completed rosters are stable.
    cache.set(jogo,{until:Date.now()+(payload.completa?30:payload.disponivel?5:2)*60_000,data:payload});
    if(cache.size>150)cache.delete(cache.keys().next().value!);
    return payload;
  })().finally(()=>inflight.delete(jogo));
  inflight.set(jogo,work);
  return work;
}
