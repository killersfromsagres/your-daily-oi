// src/lib/football-backup.ts — keyless TheSportsDB daily soccer feed, timezone-safe.
import {
  addDaysUTC, dataBrasilia, horaBrasilia, normalizeSoccerName,
  type JogoBrasileirao,
} from "./jogos-match";

const FEED = "https://www.thesportsdb.com/api/v1/json/123/";
const TIMEOUT_MS = 4800;
type SourceEvent = {
  idEvent?: string; dateEvent?: string; strTimestamp?: string | null;
  strTime?: string | null; strHomeTeam?: string; strAwayTeam?: string;
  idLeague?: string; strLeague?: string;
  strHomeTeamBadge?: string | null; strAwayTeamBadge?: string | null;
  strLeagueBadge?: string | null; strStatus?: string | null;
  intHomeScore?: string | number | null; intAwayScore?: string | number | null;
  strVenue?: string | null;
};
function safeHttps(value?: string | null): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  try { const u=new URL(value); return u.protocol==="https:" ? u.href : undefined; }
  catch {return undefined;}
}
function parseKickoff(raw: SourceEvent): Date | null {
  const timestamp=raw.strTimestamp?.trim();
  const candidate=timestamp || (raw.dateEvent && raw.strTime
    ? raw.dateEvent + "T" + raw.strTime.trim() : null);
  if (!candidate) return null;
  // TheSportsDB strTimestamp is UTC, not the viewer's browser time.
  const utc=/Z$|[+-]\d\d:\d\d$/.test(candidate) ? candidate : candidate+"Z";
  const parsed=new Date(utc);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function leagueInfo(name: string,id: string): {
  id:string;grupo:JogoBrasileirao["grupo"];
} {
  const normalized=normalizeSoccerName(name);
  if(/brazilian serie a|brasileir[aã]o s[eé]rie a|brazil serie a/.test(normalized))
    return {id:"bra.1",grupo:"brasileirao"};
  if(/brazilian serie b|brasileir[aã]o s[eé]rie b|brazil serie b/.test(normalized))
    return {id:"bra.2",grupo:"brasileirao"};
  if(/champions league/.test(normalized))return {id:"uefa.champions",grupo:"champions"};
  if(/copa do brasil/.test(normalized))return {id:"bra.copa_do_brazil",grupo:"copas"};
  if(/libertadores/.test(normalized))return {id:"conmebol.libertadores",grupo:"copas"};
  if(/sudamericana|sul americana/.test(normalized))return {id:"conmebol.sudamericana",grupo:"copas"};
  if(/nations league|world cup|qualif|euro|copa america/.test(normalized))
    return {id:"sportsdb:"+id,grupo:"copas"};
  if(/premier league/.test(normalized))return {id:"eng.1",grupo:"internacional"};
  if(/spanish la liga|laliga/.test(normalized))return {id:"esp.1",grupo:"internacional"};
  if(/bundesliga/.test(normalized))return {id:"ger.1",grupo:"internacional"};
  if(/italian serie a/.test(normalized))return {id:"ita.1",grupo:"internacional"};
  return {id:"sportsdb:"+id,grupo:"internacional"};
}
const NATIONAL = /nations league|world cup|qualif|copa america|euro|brasileirao|brazilian serie a/i;
export function sportsDbToFixture(raw: SourceEvent, date: string): JogoBrasileirao | null {
  const id=String(raw.idEvent||"");
  if(!/^\d{3,12}$/.test(id)||!raw.strHomeTeam||!raw.strAwayTeam)return null;
  const start=parseKickoff(raw);
  if(!start||dataBrasilia(start)!==date)return null;
  const home=raw.strHomeTeam.trim(),away=raw.strAwayTeam.trim();
  if(!home||!away||normalizeSoccerName(home)===normalizeSoccerName(away))return null;
  const league=String(raw.strLeague||"Futebol").trim();
  const category=leagueInfo(league,String(raw.idLeague||"0"));
  const code=String(raw.strStatus||"").trim().toLowerCase();
  const finished=/finished|full.?time|encerrad|\bft\b|completed/.test(code);
  const live=/in.?progress|live|1st half|2nd half|half time|\bht\b/.test(code);
  const postponed=/postpon|cancel|suspend|adiad/.test(code);
  const score=(v:unknown)=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
  const status=postponed?"adiado":finished?"encerrado":live?"ao-vivo":"agendado";
  return {
    id:"sportsdb:"+id,casa:home,fora:away,
    escudoCasa:safeHttps(raw.strHomeTeamBadge),escudoFora:safeHttps(raw.strAwayTeamBadge),
    horarioLocal:horaBrasilia(start),inicioIso:start.toISOString(),dataLocal:date,
    estadio:raw.strVenue?.trim().slice(0,120)||undefined,
    rodada:undefined,liga:league,ligaId:category.id,ligaLogo:safeHttps(raw.strLeagueBadge)||null,
    grupo:category.grupo,status,
    fase:status==="ao-vivo"?"ao-vivo":status, faseRotulo:status==="ao-vivo"?"Ao vivo":undefined,
    minuto:null,placarCasa:status==="agendado"?null:score(raw.intHomeScore),
    placarFora:status==="agendado"?null:score(raw.intAwayScore),
    destaque:NATIONAL.test(league),canalId:null,canalNome:null,canalLogo:null,
    transmissao:"nao-confirmada",
  };
}
async function queryDate(date: string): Promise<SourceEvent[]> {
  const url=FEED+"eventsday.php?d="+encodeURIComponent(date)+"&s=Soccer";
  const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(!response.ok)throw new Error("TheSportsDB "+response.status);
  const json=await response.json() as {events?:SourceEvent[]|null};
  return Array.isArray(json.events)?json.events:[];
}
/** Query the target and next UTC day to include late Brazilian kickoff times. */
export async function fetchSportsDbFixtures(date: string): Promise<JogoBrasileirao[]> {
  const [a,b]=await Promise.allSettled([queryDate(date),queryDate(addDaysUTC(date,1))]);
  if(a.status==="rejected"&&b.status==="rejected")throw new Error("TheSportsDB indisponível");
  const map=new Map<string,JogoBrasileirao>();
  for(const entry of [a,b]){
    if(entry.status!=="fulfilled")continue;
    for(const event of entry.value){
      const fixture=sportsDbToFixture(event,date);
      if(fixture)map.set(fixture.id,fixture);
    }
  }
  return [...map.values()];
}
/** ESPN and TheSportsDB use independent IDs. Merge by both clubs and kickoff. */
export function mergeProviderFixtures(primary: readonly JogoBrasileirao[],backup: readonly JogoBrasileirao[]): JogoBrasileirao[] {
  const result=[...primary];
  for(const candidate of backup){
    const duplicate=result.find(game=>{
      const at=Math.abs(Date.parse(game.inicioIso)-Date.parse(candidate.inicioIso));
      return at<110*60_000 &&
        normalizeSoccerName(game.casa)===normalizeSoccerName(candidate.casa) &&
        normalizeSoccerName(game.fora)===normalizeSoccerName(candidate.fora);
    });
    if(!duplicate)result.push(candidate);
    else {
      // Preserve ESPN identity/confirmed broadcasters; only fill missing images.
      duplicate.escudoCasa ||= candidate.escudoCasa;
      duplicate.escudoFora ||= candidate.escudoFora;
      duplicate.ligaLogo ||= candidate.ligaLogo;
    }
  }
  return result;
}
