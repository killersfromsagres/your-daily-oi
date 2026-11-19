/**
 * ESPN -> TheSportsDB image enrichment for ANY ESPN game in today's fixture
 * schedule. A roster row must already exist in the event's ESPN lineup.
 * No third-party person is added to that lineup or assigned as a manager.
 */
import {providerPhoto,photoFromSportsDbRecord} from "./lineup-photo-source";

export type IdentityPlayer={id:string;name:string;photo:string|null;photoFallback?:string|null};
export type IdentityCoach={id?:string|null;name:string;photo:string|null;photoFallback?:string|null};
export type IdentityTeam={
  name:string;espnTeamId?:string|null;
  coach:IdentityCoach|null;
  starting:IdentityPlayer[];substitutes:IdentityPlayer[];
};
export type DirectoryPlayer={
  idPlayer?:string|null;idESPN?:string|null;
  strPlayer?:string|null;strPlayerAlternate?:string|null;strTeam?:string|null;
  strSport?:string|null;strThumb?:string|null;strCutout?:string|null;strRender?:string|null;
  strPosition?:string|null;strStatus?:string|null;
};
export type DirectoryTeam={
  idTeam?:string|null;idESPN?:string|null;
  strTeam?:string|null;strTeamAlternate?:string|null;
  strSport?:string|null;strCountry?:string|null;
};
type DirectoryResult={player?:DirectoryPlayer|null;match:"id"|"name"|null};

const clean=(s:unknown)=>typeof s==="string"?s.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g," ")
  .replace(/\s+/g," ").trim():"";
const clubAliases:Record<string,string>={
  "sport club corinthians paulista":"corinthians",
  "sc corinthians":"corinthians",
  "corinthians sp":"corinthians",
  "botafogo de futebol e regatas":"botafogo",
  "botafogo rj":"botafogo",
  "clube de regatas do flamengo":"flamengo",
  "cr flamengo":"flamengo",
  "gremio foot ball porto alegrense":"gremio",
  "gremio porto alegre":"gremio",
  "sociedade esportiva palmeiras":"palmeiras",
  "cruzeiro esporte clube":"cruzeiro",
  "esporte clube bahia":"bahia",
};
function club(s:unknown){const n=clean(s);return clubAliases[n]||n;}
function sameClub(a:unknown,b:unknown):boolean{
  const left=club(a),right=club(b);
  return !!left&&!!right&&(left===right||
    (left.length>6&&right.startsWith(left+" "))||
    (right.length>6&&left.startsWith(right+" ")));
}
export function samePerson(espnName:string,espnId:string,other:DirectoryPlayer):"id"|"name"|null {
  const linked=String(other.idESPN||"").trim();
  if(linked&&/^\d+$/.test(linked)){
    return linked===espnId?"id":null;
  }
  const otherNames=[other.strPlayer,other.strPlayerAlternate].filter(Boolean);
  const wanted=clean(espnName);
  if(!wanted)return null;
  for(const candidate of otherNames){
    const actual=clean(candidate);
    if(!actual)continue;
    if(actual===wanted)return "name";
    // "Hugo Souza" -> "Hugo Nogueira de Souza": both first and last
    // must be exact and the middle name only an expansion. A verified club
    // and a unique match are required by the outer caller as well.
    const a=wanted.split(" "),b=actual.split(" ");
    if(a.length>=2&&b.length>=2&&a[0]===b[0]&&
      a[a.length-1]===b[b.length-1]&&
      a[a.length-1]!.length>=5&&
      (a.length===2||b.length===2))return "name";
  }
  return null;
}
export function matchDirectoryPlayer(
  player:IdentityPlayer,teamName:string,
  verifiedRoster:readonly DirectoryPlayer[],
):DirectoryResult {
  const matches=verifiedRoster.flatMap(candidate=>{
    if(candidate.strSport&&!/^(soccer|football)$/i.test(candidate.strSport))return [];
    // A strong cross-provider ESPN ID is more authoritative than a player's
    // current club, which can differ from the club in a past match.
    if(candidate.strTeam&&!sameClub(candidate.strTeam,teamName)&&
       String(candidate.idESPN||"")!==player.id)return [];
    const match=samePerson(player.name,player.id,candidate);
    return match?[{player:candidate,match}]:[];
  });
  // A cross-provider ESPN ID is a definitive match; a name-only result must
  // be unique within the verified club's roster to avoid false photographs.
  const ids=matches.filter(p=>p.match==="id");
  if(ids.length===1)return ids[0]!;
  const names=matches.filter(p=>p.match==="name");
  return names.length===1?names[0]!:{player:null,match:null};
}
export function findVerifiedDirectoryTeam(
  requested:IdentityTeam,results:readonly DirectoryTeam[],country?:string,
):DirectoryTeam|null {
  const eligible=results.filter(t=>(!t.strSport||/^(soccer|football)$/i.test(t.strSport))&&
    (country!=="BR"||!t.strCountry||/^(brazil|brasil)$/i.test(t.strCountry)));
  const byId=eligible.filter(t=>requested.espnTeamId&&t.idESPN===requested.espnTeamId);
  if(byId.length===1)return byId[0]!;
  const byName=eligible.filter(t=>sameClub(t.strTeam,requested.name)||
    (t.strTeamAlternate?.split(";").some(alias=>sameClub(alias,requested.name))??false));
  return byName.length===1?byName[0]!:null;
}
const CACHE_TTL=30*60_000;
const dirCache=new Map<string,{until:number;players:DirectoryPlayer[]}>();
const pending=new Map<string,Promise<DirectoryPlayer[]>>();
const queryJson=async<T>(url:string):Promise<T|null>=>{
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(3500),headers:{Accept:"application/json"}});
    if(!response.ok)return null;
    return await response.json() as T;
  }catch{return null;}
};
async function directoryForTeam(team:IdentityTeam,country?:string):Promise<DirectoryPlayer[]>{
  const cacheKey=club(team.name)+"|"+(team.espnTeamId||"")+"|"+(country||"");
  const hit=dirCache.get(cacheKey);
  if(hit&&hit.until>Date.now())return hit.players;
  const running=pending.get(cacheKey);
  if(running)return running;
  const work=(async()=>{
    const search=new URL("https://www.thesportsdb.com/api/v1/json/123/searchteams.php");
    search.searchParams.set("t",team.name);
    const results=await queryJson<{teams?:DirectoryTeam[]|null}>(search.toString());
    const correct=findVerifiedDirectoryTeam(team,results?.teams||[],country);
    if(!correct||!/^\d{3,12}$/.test(String(correct.idTeam||"")))return [];
    const url="https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id="+
      encodeURIComponent(correct.idTeam!);
    const roster=await queryJson<{player?:DirectoryPlayer[]|null;players?:DirectoryPlayer[]|null}>(url);
    const list=Array.isArray(roster?.player)?roster.player:
      Array.isArray(roster?.players)?roster.players:[];
    return list.slice(0,120);
  })().then(players=>{
    if(dirCache.size>150)dirCache.delete(dirCache.keys().next().value!);
    dirCache.set(cacheKey,{until:Date.now()+CACHE_TTL,players});
    return players;
  }).finally(()=>pending.delete(cacheKey));
  pending.set(cacheKey,work);
  return work;
}
export function verifiedImageFromRoster(
  person:IdentityPlayer,clubName:string,records:readonly DirectoryPlayer[],
):string|null {
  const {player}=matchDirectoryPlayer(person,clubName,records);
  return player?photoFromSportsDbRecord(player):null;
}
/**
 * Loads two club directories concurrently; no user search or arbitrary image
 * search is involved. Returns unchanged data for unsupported/missing teams.
 * This does not invent names, coaches, formations or starter status.
 */
export async function enrichESPNPortraits<T extends IdentityTeam>(
  teams:readonly T[],country?:string,
):Promise<T[]> {
  const found=await Promise.all(teams.map(team=>directoryForTeam(team,country)));
  return teams.map((team,index)=>{
    const directory=found[index]||[];
    const withPhoto=<P extends IdentityPlayer>(p:P):P=>{
      const matched=verifiedImageFromRoster(p,team.name,directory);
      if(!matched)return p;
      return {...p,photo:matched,photoFallback:p.photo||null};
    };
    return {...team,starting:team.starting.map(withPhoto),
      substitutes:team.substitutes.map(withPhoto)};
  });
}
