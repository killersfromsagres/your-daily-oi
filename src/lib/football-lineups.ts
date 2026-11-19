// src/lib/football-lineups.ts — ESPN match rosters + TheSportsDB lineup, server-only.
// Never invent starters/coach/photos before the provider releases the lineup.
import { LIGAS_FUTEBOL, normalizeSoccerName } from "./jogos-match";
import { resolveFootballPosition, type PlayerPosition } from "./football-positions";
import { enrichKnownLineupPhotos, photoFromSportsDbRecord } from "./lineup-photo-source";
import { enrichESPNPortraits } from "./lineup-verified-portraits";
import { loadVerifiedEventCoaches, matchFixtureClub } from "./lineup-match-coaches";
export type { PlayerPosition } from "./football-positions";
export interface LineupPlayer {
  id:string;name:string;number:string|null;position:string;
  group:PlayerPosition;photo:string|null;photoFallback?:string|null;grid:string|null;
}
export interface LineupCoach {name:string;photo:string|null;id?:string|null;photoFallback?:string|null;}
export interface LineupTeam {
  name:string;formation:string|null;crest:string|null;
  espnTeamId?:string|null;
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
  return resolveFootballPosition(raw).group;
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
    const photo=photoFromSportsDbRecord(entry);
    if(/manager|head coach|treinador|t[eé]cnico|coach/i.test(role)){
      team.coach={name,photo,id:/^\d{1,12}$/.test(String(entry.idPlayer||""))?String(entry.idPlayer):null};
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
/**
 * Enrich only people already included in the verified event's published roster.
 * A photo lookup may fail; that leaves the true athlete/coach name with a
 * neutral fallback instead of assigning a photograph to the wrong person.
 */
export async function enrichSportsDbMatchPhotos(
  original:MatchLineups,
):Promise<MatchLineups> {
  // Prioritize BOTH coaches, then interleave home/away starters so the free
  // provider lookup budget cannot consume every request on just one squad.
  const candidates:Array<{id:string;hasPhoto:boolean}>=[];
  for(const team of original.equipes){
    if(team.coach?.id)candidates.push({id:team.coach.id,hasPhoto:!!team.coach.photo});
  }
  for(const kind of ["starting","substitutes"] as const){
    const longest=Math.max(0,...original.equipes.map(team=>team[kind].length));
    for(let i=0;i<longest;i++){
      for(const team of original.equipes){
        const player=team[kind][i];
        if(player)candidates.push({id:player.id,hasPhoto:!!player.photo});
      }
    }
  }
  const photos=await enrichKnownLineupPhotos(candidates,12);
  if(!photos.size)return original;
  return {...original,equipes:original.equipes.map(team=>({
    ...team,
    coach:team.coach?{...team.coach,photo:team.coach.photo||
      (team.coach.id?photos.get(team.coach.id):null)||null}:null,
    starting:team.starting.map(player=>({...player,photo:player.photo||photos.get(player.id)||null})),
    substitutes:team.substitutes.map(player=>({...player,photo:player.photo||photos.get(player.id)||null})),
  }))};
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
  header?:{competitions?:Array<{date?:string;
    competitors?:Array<{homeAway?:string;team?:{id?:string;displayName?:string;name?:string}}>
  }>};
  boxscore?:{form?:Array<{team?:{id?:string;displayName?:string;logo?:string};formation?:string;coach?:{name?:string;displayName?:string;headshot?:{href?:string}}}>};
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
    // ESPN sometimes returns rosters and boxscore forms in different orders.
    // Match by an actual team identifier/name; never assign another club's
    // manager or tactical setup solely by the index of a response array.
    const form=raw.boxscore?.form?.find(entry=>{
      const a=item.team,b=entry.team;
      if(a?.id&&b?.id&&a.id===b.id)return true;
      const left=normalizeSoccerName(a?.displayName||a?.name||"");
      const right=normalizeSoccerName(b?.displayName||"");
      return !!left&&!!right&&left===right;
    });
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
      espnTeamId:item.team?.id||form?.team?.id||null,
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
      payload=await enrichSportsDbMatchPhotos(
        parseSportsDbLineups(jogo,Array.isArray(json.lineup)?json.lineup:[]),
      );
    }else{
      const idx=jogo.lastIndexOf(":"), league=jogo.slice(0,idx), event=jogo.slice(idx+1);
      const url="https://site.api.espn.com/apis/site/v2/sports/soccer/"+
        encodeURIComponent(league)+"/summary?event="+encodeURIComponent(event);
      const response=await fetch(url,{signal:AbortSignal.timeout(5500),headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("ESPN lineup HTTP "+response.status);
      const json=await response.json() as ESPNSummary;
      const parsed=parseESPNLineups(jogo,json);
      // Only same-fixture records may supply a missing manager. A team's
      // present-day manager is not proof of who coached a historical fixture.
      const competition=json.header?.competitions?.[0];
      const home=competition?.competitors?.find(t=>t.homeAway==="home");
      const away=competition?.competitors?.find(t=>t.homeAway==="away");
      const timestamp=competition?.date?Date.parse(competition.date):NaN;
      const parts=Number.isFinite(timestamp)
        ?new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",
          year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(timestamp))
        :[];
      const field=(kind:string)=>parts.find(p=>p.type===kind)?.value||"";
      const brazilDate=parts.length?
        [field("year"),field("month"),field("day")].join("-"):"";
      const [portraits,managers]=await Promise.all([
        enrichESPNPortraits(parsed.equipes,league==="bra.1"?"BR":undefined),
        home&&away&&brazilDate?loadVerifiedEventCoaches({
          home:home.team?.displayName||home.team?.name||"",
          away:away.team?.displayName||away.team?.name||"",
          date:brazilDate,
        }):Promise.resolve(new Map()),
      ]);
      payload={...parsed,equipes:portraits.map(team=>{
        const side=home&&matchFixtureClub(team.name,home.team?.displayName||home.team?.name||"")
          ?"home":away&&matchFixtureClub(team.name,away.team?.displayName||away.team?.name||"")
          ?"away":null;
        return {...team,coach:team.coach || (side?managers.get(side):null) || null};
      })};
    }
    // A complete XI can still receive corrections before kickoff or during play.
    cache.set(jogo,{until:Date.now()+60_000,data:payload});
    if(cache.size>150)cache.delete(cache.keys().next().value!);
    return payload;
  })().finally(()=>inflight.delete(jogo));
  inflight.set(jogo,work);
  return work;
}
