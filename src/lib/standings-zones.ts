/**
 * Qualification zones for football standings, scoped to each competition
 * FORMAT. No generic 'top 6 Libertadores' assumption across championships.
 *
 * Source indications (ESPN note) are preferred whenever explicit. Rank-only
 * assignments are labeled as provisional POSITION ZONES, not clinched spots:
 * cup winners, UEFA performance slots, license and other cups may redistribute
 * continental entries before the final classification.
 *
 * 2026 regulations:
 * CBF Série A: https://www.cbf.com.br/futebol-brasileiro/noticias/noticias-copa-brasil-masculino/a/copa-do-brasil-de-2026-dara-duas-vagas-a-libertadores
 * CBF Série B: https://www.cbf.com.br/futebol-brasileiro/noticias/selecao-masculina/comunicado-1/brasileirao-serie-b-comeca-com-novo-formato
 * UEFA: https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2026/27/Article-17-Match-system-league-phase-Online
 * MLS: https://www.mlssoccer.com/news/2026-mls-competition-guidelines
 * CONMEBOL: https://gol.conmebol.com/libertadores/pt-br/news/sorteio-da-fase-de-grupos-da-conmebol-libertadores-2026-data-horario-classificados-potes-e
 */
export type StandingZoneId =
  |"libertadores"|"pre-libertadores"|"sulamericana"|"champions"|"pre-champions"
  |"europa"|"conference"|"promotion"|"promotion-playoff"
  |"playoff"|"knockout-direct"|"knockout-playoff"|"sudamericana-playoff"
  |"relegation-playoff"|"relegation"|"eliminated";

export type StandingZone = {
  id:StandingZoneId;
  label:string;
  /** Provider note is more specific than inferred position. */
  evidence:"provider"|"projected";
  explanation:string;
};
export type StandingZoneContext={
  leagueId:string;season:string|null;groupName:string;
  size:number;position:number;note:string|null;
};
export type StandingZoneDef={id:StandingZoneId;label:string};
export const STANDING_ZONE_NAMES:Record<StandingZoneId,string>={
  "libertadores":"Libertadores",
  "pre-libertadores":"Pré-Libertadores",
  "sulamericana":"Sul-Americana",
  "champions":"Champions League",
  "pre-champions":"Pré-Champions",
  "europa":"Europa League",
  "conference":"Conference League",
  "promotion":"Acesso direto",
  "promotion-playoff":"Playoff de acesso",
  "playoff":"Playoffs",
  "knockout-direct":"Oitavas de final",
  "knockout-playoff":"Repescagem / Playoff",
  "sudamericana-playoff":"Playoff Sul-Americana",
  "relegation-playoff":"Playoff de permanência",
  "relegation":"Rebaixamento",
  "eliminated":"Eliminado",
};
const simplify=(s:string)=>s.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[‐-‒–—]/g,"-").replace(/\s+/g," ").trim();
export function zoneFromSourceNote(note:string|null):StandingZoneId|null {
  const n=simplify(note||"");
  if(!n)return null;
  // Relegation before ordinary play-offs; avoid conflating 16th-place
  // Bundesliga survival with the championship or promotion playoffs.
  if(/relegat|rebaix|descens|demot/.test(n)){
    return /play.?off|qualif|repesc|disputa/.test(n)?"relegation-playoff":"relegation";
  }
  if(/promot|acesso|ascens|subida/.test(n)){
    return /play.?off|repesc|disputa/.test(n)?"promotion-playoff":"promotion";
  }
  if(/libertador/.test(n))return /pre.?libert|prelim|(?:fase|phase) [123]|(?:qualifying|qualification) (?:round|stage|phase|play.?off)/.test(n)
    ?"pre-libertadores":"libertadores";
  if(/sudamericana|sul.?americana/.test(n))return /play.?off|repesc/.test(n)
    ?"sudamericana-playoff":"sulamericana";
  if(/champions league|liga dos campeoes|liga de campeones/.test(n)){
    return /prelim|(?:qualifying|qualification) (?:round|stage|phase|play.?off)|\bplay.?off\b/.test(n)?"pre-champions":"champions";
  }
  if(/conference league|liga conferencia|liga de conferencia/.test(n))return "conference";
  if(/europa league|liga europa/.test(n))return "europa";
  if(/round of 16|oitavas|octavos/.test(n))return "knockout-direct";
  if(/knockout(?: phase)? play.?off|play.?off.*knockout|repescagem|repechaje/.test(n))return "knockout-playoff";
  if(/eliminat|eliminad|out of contention/.test(n))return "eliminated";
  if(/play.?off|liguilla/.test(n))return "playoff";
  return null;
}
function provisional(id:StandingZoneId):StandingZone{
  return {id,label:STANDING_ZONE_NAMES[id],evidence:"projected",
    explanation:"Faixa de classificação por posição, estimada pelo formato de 2026; pode mudar por copas, regulamentos e resultados."};
}
function provider(id:StandingZoneId,note:string):StandingZone{
  return {id,label:STANDING_ZONE_NAMES[id],evidence:"provider",
    explanation:"Indicação da fonte esportiva: "+note};
}
function inRange(p:number,start:number,end:number){return p>=start&&p<=end;}
const yearOf=(season:string|null)=>Number(/\b(20\d{2})\b/.exec(season||"")?.[1]||0);

/** Ranking-only fallback used only for a FULL expected table and an applicable
 * current format. Never assign a rank-zone to an incomplete table or a cup
 * knockout bracket. */
export function standingZone(input:StandingZoneContext):StandingZone|null{
  const {leagueId,groupName,size,position,note}=input;
  if(!Number.isInteger(position)||position<1||position>size)return null;
  const provided=zoneFromSourceNote(note);
  if(provided)return provider(provided,note!);
  const year=yearOf(input.season);
  const group=simplify(groupName);
  const expectedGroups=/\b(grupo|group|zona|zone)\b/.test(group);
  let id:StandingZoneId|null=null;
  switch(leagueId){
    case "bra.1":
      if(size!==20)return null;
      if(inRange(position,17,20))id="relegation";
      else if(year===2026){
        if(inRange(position,1,4))id="libertadores";
        else if(position===5)id="pre-libertadores";
        else if(inRange(position,6,11))id="sulamericana";
      }
      break;
    case "bra.2":
      if(size!==20)return null;
      if(position>=17)id="relegation";
      else if(year===2026){
        if(position<=2)id="promotion";
        else if(position<=6)id="promotion-playoff";
      }else if(year>0&&year<2026&&position<=4)id="promotion";
      break;
    case "uefa.champions":
    case "uefa.europa":
      // New Swiss-system phase has 36 participants in a single league table.
      if(year>=2024 && size===36 && !expectedGroups){
        if(position<=8)id="knockout-direct";
        else if(position<=24)id="knockout-playoff";
        else id="eliminated";
      }
      break;
    case "conmebol.libertadores":
      if(size===4&&expectedGroups){
        if(position<=2)id="knockout-direct";
        else if(position===3)id="sudamericana-playoff";
        else id="eliminated";
      }
      break;
    case "conmebol.sudamericana":
      if(size===4&&expectedGroups){
        if(position===1)id="knockout-direct";
        else if(position===2)id="knockout-playoff";
        else id="eliminated";
      }
      break;
    case "eng.1":
    case "esp.1":
    case "ita.1":
      if(size!==20)return null;
      if(position>=18)id="relegation";
      else if(position<=4)id="champions";
      else if(position===5)id="europa";
      else if(position===6)id="conference";
      break;
    case "ger.1":
      if(size!==18)return null;
      if(position>=17)id="relegation";
      else if(position===16)id="relegation-playoff";
      else if(position<=4)id="champions";
      else if(position===5)id="europa";
      else if(position===6)id="conference";
      break;
    case "fra.1":
      if(size!==18)return null;
      if(position>=17)id="relegation";
      else if(position===16)id="relegation-playoff";
      else if(position<=3)id="champions";
      else if(position===4)id="pre-champions";
      else if(position===5)id="europa";
      else if(position===6)id="conference";
      break;
    case "por.1":
      if(size!==18)return null;
      if(position>=17)id="relegation";
      else if(position===16)id="relegation-playoff";
      else if(position===1)id="champions";
      else if(position===2)id="pre-champions";
      else if(position===3)id="europa";
      else if(position===4)id="conference";
      break;
    case "ned.1":
      if(size!==18)return null;
      if(position>=17)id="relegation";
      else if(position===16)id="relegation-playoff";
      else if(position<=2)id="champions";
      else if(position===3)id="pre-champions";
      else if(position===4)id="europa";
      else if(position===5)id="conference";
      break;
    case "sco.1":
      if(size!==12)return null;
      if(position===12)id="relegation";
      else if(position===11)id="relegation-playoff";
      // European coefficients determine the exact number of places; only
      // paint source-confirmed entries rather than guessing current slots.
      break;
    case "arg.1":
      // Argentine Apertura/Clausura 2026: two distinct groups of 15,
      // eight clubs from each advance. Overall yearly ranking is different.
      if(year===2026&&size===15&&expectedGroups&&position<=8)id="playoff";
      break;
    case "usa.1":
      // 2026 MLS top seven of EACH conference qualify directly, 8/9 wildcard.
      if(year===2026&&size>=14&&size<=17&&
        /east|west|leste|oeste|conferenc/.test(group)){
        if(position<=7)id="playoff";
        else if(position<=9)id="knockout-playoff";
      }
      break;
    case "mex.1":
      // Apertura 2026 onwards: top eight directly reach quarterfinals.
      if(year>=2026&&size===18&&position<=8)id="playoff";
      break;
    default:break; // Copa do Brasil or unrecognized formats have no rank-based bands.
  }
  return id?provisional(id):null;
}
export function leagueZones(
  leagueId:string,season:string|null,groupName:string,
  rows:readonly {position:number;note:string|null}[],
):Map<number,StandingZone>{
  const result=new Map<number,StandingZone>();
  for(const row of rows){
    const zone=standingZone({leagueId,season,groupName,size:rows.length,
      position:row.position,note:row.note});
    if(zone)result.set(row.position,zone);
  }
  return result;
}
export function leagueZoneLegend(zones:ReadonlyMap<number,StandingZone>):StandingZoneDef[]{
  const seen=new Set<StandingZoneId>();
  const legend:StandingZoneDef[]=[];
  for(const zone of zones.values()){
    if(seen.has(zone.id))continue;
    seen.add(zone.id);
    legend.push({id:zone.id,label:zone.label});
  }
  return legend;
}
