/**
 * On-demand picture discovery is independent from the match lineup request:
 * the first display remains fast, missing faces can fill in progressively.
 * Public TheSportsDB search is accepted ONLY after comparison to an athlete
 * or named manager already present in the authorized match roster.
 */
import {getMatchLineups,validLineupId} from "./football-lineups";
import {matchDirectoryPlayer,samePerson,type DirectoryPlayer} from "./lineup-verified-portraits";
import {photoFromSportsDbRecord} from "./lineup-photo-source";
import {matchFixtureClub} from "./lineup-match-coaches";
const cache=new Map<string,{expires:number;photo:string|null}>();
const pending=new Map<string,Promise<string|null>>();
export function selectVerifiedSearchPortrait(
  id:string,name:string,team:string,
  candidates:readonly DirectoryPlayer[],
):string|null {
  const plausible=candidates.filter(candidate=>{
    if(candidate.strSport&&!/^(soccer|football)$/i.test(candidate.strSport))return false;
    const match=samePerson(name,id,candidate);
    // For an open name search, allow matching by full ESPN ID OR by a
    // verified team name. Search hits with no team cannot confirm identity.
    if(match==="id")return true;
    if(match!=="name"||!candidate.strTeam)return false;
    return matchFixtureClub(candidate.strTeam,team);
  });
  // Multiple plausible identities are ambiguous: do not choose a random face.
  const strong=plausible.filter(row=>String(row.idESPN||"")===id);
  if(strong.length===1)return photoFromSportsDbRecord(strong[0]!);
  return plausible.length===1?photoFromSportsDbRecord(plausible[0]!):null;
}
async function discover(name:string,id:string,team:string):Promise<string|null>{
  const key=id+"|"+name+"|"+team;
  const hit=cache.get(key);
  if(hit&&hit.expires>Date.now())return hit.photo;
  const active=pending.get(key);
  if(active)return active;
  const work=(async()=>{
    try{
      const url=new URL("https://www.thesportsdb.com/api/v1/json/123/searchplayers.php");
      url.searchParams.set("p",name);
      const response=await fetch(url,{signal:AbortSignal.timeout(3200),headers:{Accept:"application/json"}});
      if(!response.ok)return null;
      const json=await response.json() as {player?:DirectoryPlayer[]|null;players?:DirectoryPlayer[]|null};
      const entries=Array.isArray(json.player)?json.player:
        Array.isArray(json.players)?json.players:[];
      return selectVerifiedSearchPortrait(id,name,team,entries.slice(0,35));
    }catch{return null;}
  })().then(photo=>{
    if(cache.size>550)cache.delete(cache.keys().next().value!);
    cache.set(key,{photo,expires:Date.now()+(photo?6*3600_000:10*60_000)});
    return photo;
  }).finally(()=>pending.delete(key));
  pending.set(key,work);
  return work;
}
export async function lookupMatchPersonPhoto(gameId:string,personId:string,role:string):Promise<string|null>{
  if(!validLineupId(gameId)||personId.length>50||!personId.trim())throw new RangeError("Invalid person");
  const lineup=await getMatchLineups(gameId);
  for(const team of lineup.equipes){
    if(role==="coach"){
      const coach=team.coach;
      if(coach&&(coach.id===personId||personId==="coach:"+team.name)){
        return discover(coach.name,coach.id||"",team.name);
      }
    }else{
      const player=[...team.starting,...team.substitutes].find(p=>p.id===personId);
      if(player)return discover(player.name,player.id,team.name);
    }
  }
  return null;
}
