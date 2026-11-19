/**
 * Verified soccer goal events (ESPN soccer scoreboard/summary).
 *
 * Do NOT infer scorers from the score difference, chronological order or
 * player statistics. A goal requires both an actual ESPN goal play and an
 * ESPN team ID matched to the fixture's home/away IDs.
 */
export type MatchGoal = {
  id:string;
  team:"home"|"away";
  scorer:string;
  minute:string;
  penalty?:boolean;
};
type Athlete = {id?:string;displayName?:string;fullName?:string;shortName?:string;
  athlete?:{id?:string;displayName?:string;fullName?:string;shortName?:string}};
export interface ESPNGoalPlay {
  id?:string|number;scoringPlay?:boolean;type?:{id?:string;name?:string;text?:string;type?:string};
  text?:string;shortText?:string;description?:string;
  clock?:{displayValue?:string;displayClock?:string};
  period?:number|{number?:number};
  team?:{id?:string;displayName?:string};teamId?:string;
  athletesInvolved?:Athlete[];
  athlete?:Athlete;
  cancelled?:boolean;disallowed?:boolean;
}
export interface ESPNGoalSummary {
  keyEvents?:ESPNGoalPlay[];
  scoringPlays?:ESPNGoalPlay[];
  details?:ESPNGoalPlay[];
  plays?:ESPNGoalPlay[];
  header?:{competitions?:Array<{details?:ESPNGoalPlay[]} | null>};
  competitions?:Array<{details?:ESPNGoalPlay[]} | null>;
}
export type MatchGoalClubs = {
  homeId?:string|undefined;awayId?:string|undefined;
};
const clean=(text?:string)=>String(text||"").trim().replace(/\s+/g," ").slice(0,85);
/** Return the already elapsed match minute; do not append 45 to an
 * ESPN absolute 82' second-half timestamp. */
export function goalMinute(play:ESPNGoalPlay):string|null {
  const raw=clean(play.clock?.displayValue||play.clock?.displayClock);
  const match=/^(\d{1,3})(?:['’′m])?(?:\+(\d{1,2}))?(?:\s*['’′])?(?::(\d{2}))?$/.exec(raw);
  if(!match)return null;
  let value=Number(match[1]);
  const extra=match[2]?Number(match[2]):null;
  const period=typeof play.period==="number"?play.period:play.period?.number;
  // ESPN period clock may restart from zero for the second half, but a
  // match minute shown with an apostrophe is already the absolute minute.
  if(period===2&&value<45&&raw.includes(":"))value+=45;
  if(value<1||value>140||(extra!==null&&extra>30))return null;
  return String(value)+(extra!==null?"+"+extra:"")+"′";
}
function isGoal(play:ESPNGoalPlay):boolean {
  const type=[play.type?.text,play.type?.name,play.type?.type].filter(Boolean).join(" ").toLowerCase();
  const title=[type,play.text,play.shortText,play.description].filter(Boolean).join(" ").toLowerCase();
  if(play.cancelled||play.disallowed||/disallowed|ruled out|anulado|no goal|gol anulado|var overturn/.test(title))return false;
  // Goal kicks, shoot-out penalties and penalty misses must not count.
  if(/goal.?kick|tiro de meta|penalty miss|penalty shootout|penalty shoot-out|shoot.?out/.test(title))return false;
  // Own goals need independent scorer and credited-team fields; ESPN event
  // team can refer to the athlete's team rather than the score recipient.
  if(/own.?goal|autogol|gol contra/.test(title))return false;
  return play.scoringPlay===true||/\bgoal\b|\bgol\b/.test(type);
}
function scorerFrom(play:ESPNGoalPlay):string|null {
  const athletes=play.athletesInvolved?.length ? play.athletesInvolved : play.athlete?[play.athlete]:[];
  if(athletes.length===0)return null;
  const athlete=athletes[0]!;
  const name=clean(athlete.athlete?.displayName||athlete.displayName||
    athlete.athlete?.fullName||athlete.fullName||
    athlete.athlete?.shortName||athlete.shortName);
  return name&&name.length>=2?name:null;
}
export function parseESPNGoalEvents(
  raw:unknown,clubs:MatchGoalClubs,
):MatchGoal[] {
  if(!raw||typeof raw!=="object"||!clubs.homeId||!clubs.awayId||
     clubs.homeId===clubs.awayId)return [];
  const data=raw as ESPNGoalSummary;
  const arrays=[
    data.keyEvents,data.scoringPlays,data.details,
    data.competitions?.[0]?.details,
    data.header?.competitions?.[0]?.details,
    data.plays,
  ];
  const seen=new Set<string>();
  const result:MatchGoal[]=[];
  for(const events of arrays){
    if(!Array.isArray(events))continue;
    for(const play of events){
      if(!play||typeof play!=="object"||!isGoal(play))continue;
      const id=String(play.team?.id||play.teamId||"");
      const side=id===clubs.homeId?"home":id===clubs.awayId?"away":null;
      if(!side)continue;
      const scorer=scorerFrom(play),minute=goalMinute(play);
      if(!scorer||!minute)continue;
      const identity=play.id?String(play.id):side+"|"+scorer+"|"+minute;
      const key=side+"|"+identity;
      if(seen.has(key))continue;
      seen.add(key);
      const type=[play.type?.name,play.type?.text,play.type?.type].join(" ").toLowerCase();
      result.push({id:key,team:side,scorer,minute,
        ...(/penalty|p[eê]nalti|penal/.test(type)?{penalty:true}:{})});
    }
  }
  return result.sort((a,b)=>{
    const minute=Number.parseInt(a.minute,10)-Number.parseInt(b.minute,10);
    return minute||a.id.localeCompare(b.id);
  }).slice(0,30);
}
const cache=new Map<string,{expires:number;goals:MatchGoal[]}>();
const inflight=new Map<string,Promise<MatchGoal[]>>();
/** Same match, same authoritative ESPN IDs, bounded and cached upstream calls.
 * Failing to fetch never removes or fabricates goals in the parent fixture. */
export async function getESPNGoalEvents(
  leagueId:string,eventId:string,clubs:MatchGoalClubs,finished=false,
):Promise<MatchGoal[]> {
  if(!/^[a-z0-9_.]+$/i.test(leagueId)||!/^[0-9]{4,12}$/.test(eventId))return [];
  if(!clubs.homeId||!clubs.awayId)return [];
  const key=leagueId+":"+eventId+":"+clubs.homeId+":"+clubs.awayId;
  const known=cache.get(key),now=Date.now();
  if(known&&known.expires>now)return known.goals;
  const active=inflight.get(key);
  if(active)return active;
  const task=(async()=>{
    try{
      const response=await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/"+
        encodeURIComponent(leagueId)+"/summary?event="+encodeURIComponent(eventId),{
        signal:AbortSignal.timeout(3500),
        headers:{Accept:"application/json"},
      });
      if(!response.ok)return known?.goals||[];
      const parsed=parseESPNGoalEvents(await response.json(),clubs);
      const output=parsed.length?parsed:known?.goals||[];
      if(cache.size>=170)cache.delete(cache.keys().next().value!);
      cache.set(key,{goals:output,expires:Date.now()+(finished?20*60_000:45_000)});
      return output;
    }catch{return known?.goals||[];}
  })().finally(()=>inflight.delete(key));
  inflight.set(key,task);
  return task;
}
