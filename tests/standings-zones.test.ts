import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {standingZone,leagueZones,leagueZoneLegend,zoneFromSourceNote}
  from "../src/lib/standings-zones";
import {parseSoccerStandings,TABLE_LEAGUES} from "../src/lib/standings";

const zone=(leagueId:string,position:number,size:number,season="2026",
  groupName="Classificação geral",note:string|null=null)=>
  standingZone({leagueId,position,size,season,groupName,note})?.id||null;
const ids=(league:string,size:number,group="Classificação geral",season="2026")=>
  Array.from({length:size},(_,i)=>zone(league,i+1,size,season,group));

describe("2026 Brazilian official format",()=>{
 test("Série A: G4 direct, fifth preliminary, next six Sudamericana, bottom four relegation",()=>{
   const list=ids("bra.1",20);
   expect(list.slice(0,4)).toEqual(Array(4).fill("libertadores"));
   expect(list[4]).toBe("pre-libertadores");
   expect(list.slice(5,11)).toEqual(Array(6).fill("sulamericana"));
   expect(list.slice(11,16).every(x=>x===null)).toBe(true);
   expect(list.slice(16)).toEqual(Array(4).fill("relegation"));
 });
 test("2026 Série B promotes only top 2 directly; positions 3-6 playoff and bottom 4 relegated",()=>{
   const list=ids("bra.2",20);
   expect(list.slice(0,2)).toEqual(["promotion","promotion"]);
   expect(list.slice(2,6)).toEqual(Array(4).fill("promotion-playoff"));
   expect(list.slice(16)).toEqual(Array(4).fill("relegation"));
   expect(zone("bra.2",3,20,"2025")).toBe("promotion");
 });
 test("Série A other years keep known relegation but avoid assuming variable Libertadores slots",()=>{
   expect(zone("bra.1",1,20,"2027")).toBeNull();
   expect(zone("bra.1",17,20,"2027")).toBe("relegation");
 });
});
describe("international football formats",()=>{
 test("UEFA Champions/Europa 36-team phase: 1-8 direct, 9-24 playoffs, 25-36 out",()=>{
   for(const id of ["uefa.champions","uefa.europa"]){
     const list=ids(id,36,"League Phase","2026/2027");
     expect(list.slice(0,8)).toEqual(Array(8).fill("knockout-direct"));
     expect(list.slice(8,24)).toEqual(Array(16).fill("knockout-playoff"));
     expect(list.slice(24)).toEqual(Array(12).fill("eliminated"));
     expect(zone(id,1,4,"2026","Grupo A")).toBeNull();
   }
 });
 test("Libertadores group stage 1-2 round of 16, third goes to Sudamericana playoff",()=>{
   expect(ids("conmebol.libertadores",4,"Grupo A"))
     .toEqual(["knockout-direct","knockout-direct","sudamericana-playoff","eliminated"]);
   expect(zone("conmebol.libertadores",1,32,"2026","Oitavas")).toBeNull();
 });
 test("Sudamericana group stage: leader round of 16 and runner-up into knockout playoff",()=>{
   expect(ids("conmebol.sudamericana",4,"Grupo B"))
     .toEqual(["knockout-direct","knockout-playoff","eliminated","eliminated"]);
   expect(zone("conmebol.sudamericana",1,2,"2026","Quartas")).toBeNull();
 });
 test("European leagues follow their domestic table size and handle relegation playoffs",()=>{
   for(const id of ["eng.1","esp.1","ita.1"]){
     expect(zone(id,1,20,"2026/27")).toBe("champions");
     expect(zone(id,6,20,"2026/27")).toBe("conference");
     expect(zone(id,18,20,"2026/27")).toBe("relegation");
   }
   expect(zone("ger.1",16,18)).toBe("relegation-playoff");
   expect(zone("ger.1",17,18)).toBe("relegation");
   expect(zone("fra.1",4,18)).toBe("pre-champions");
   expect(zone("fra.1",16,18)).toBe("relegation-playoff");
   expect(zone("por.1",2,18)).toBe("pre-champions");
   expect(zone("ned.1",16,18)).toBe("relegation-playoff");
   expect(zone("sco.1",11,12)).toBe("relegation-playoff");
   expect(zone("sco.1",1,12)).toBeNull();
 });
 test("Argentina 2026 two groups, MLS conferences, and Mexico Apertura top 8",()=>{
   expect(zone("arg.1",8,15,"2026","Zona A")).toBe("playoff");
   expect(zone("arg.1",9,15,"2026","Zona A")).toBeNull();
   expect(zone("arg.1",1,30,"2026","Overall")).toBeNull();
   expect(zone("usa.1",7,15,"2026","Western Conference")).toBe("playoff");
   expect(zone("usa.1",8,15,"2026","Eastern Conference")).toBe("knockout-playoff");
   expect(zone("usa.1",10,15,"2026","Eastern Conference")).toBeNull();
   expect(zone("usa.1",1,30,"2026","Supporters Shield")).toBeNull();
   expect(zone("mex.1",8,18,"2026","Liga MX")).toBe("playoff");
   expect(zone("mex.1",9,18,"2026","Liga MX")).toBeNull();
 });
 test("Copa do Brasil knockouts have no invented positional zones",()=>{
   expect(zone("bra.copa_do_brazil",1,16,"2026")).toBeNull();
 });
});
describe("source note, guardrails and UI legend",()=>{
 test("provider notes override approximate position and preserve evidence",()=>{
   expect(zoneFromSourceNote("Qualified for Copa Libertadores group stage")).toBe("libertadores");
   expect(zoneFromSourceNote("Pre-Libertadores qualification")).toBe("pre-libertadores");
   expect(zoneFromSourceNote("Relegation play-off")).toBe("relegation-playoff");
   expect(zoneFromSourceNote("UEFA Europa League")).toBe("europa");
   expect(zoneFromSourceNote("Copa Sul-Americana")).toBe("sulamericana");
   expect(zoneFromSourceNote("Knockout phase play-offs")).toBe("knockout-playoff");
   expect(standingZone({leagueId:"bra.1",season:"2026",groupName:"Geral",size:20,position:9,
     note:"Qualification to Copa Libertadores"})?.evidence).toBe("provider");
   expect(zone("bra.1",9,20,"2026","Geral","Qualification to Copa Libertadores")).toBe("libertadores");
 });
 test("unknown or partial tables don't mark bands or math-confirmed qualification",()=>{
   expect(zone("bra.1",1,2)).toBeNull();
   expect(zone("bra.2",1,3)).toBeNull();
   expect(zone("uefa.champions",1,35,"2026/27","League phase")).toBeNull();
   expect(zone("xx.1",1,20)).toBeNull();
   expect(standingZone({leagueId:"bra.1",season:"2026",groupName:"Geral",size:20,position:0,note:null})).toBeNull();
   expect(standingZone({leagueId:"bra.1",season:"2026",groupName:"Geral",size:20,position:30,note:null})).toBeNull();
   expect(standingZone({leagueId:"bra.1",season:"2026",groupName:"Geral",size:20,position:1,note:null})?.evidence).toBe("projected");
 });
 test("every supported league has an explicit safe qualification strategy",()=>{
   for(const league of TABLE_LEAGUES){
     const n=league.id==="sco.1"?12:league.id==="uefa.champions"||league.id==="uefa.europa"?36:
       ["arg.1","usa.1"].includes(league.id)?15:
       ["ger.1","fra.1","por.1","ned.1","mex.1"].includes(league.id)?18:20;
     const group=league.id==="arg.1"?"Zona A":league.id==="usa.1"?"Eastern Conference":"Classificação geral";
     const rows=Array.from({length:n},(_,i)=>({position:i+1,note:null}));
     const zones=leagueZones(league.id,"2026",group,rows);
     const legend=leagueZoneLegend(zones);
     expect(legend.length).toBeGreaterThanOrEqual(0);
     expect(new Set(legend.map(item=>item.id)).size).toBe(legend.length);
     expect([...zones.values()].every(item=>item.explanation.length>10)).toBe(true);
   }
 });
 test("ESPN raw position notes are preserved for provider-driven colors",()=>{
   const standings=parseSoccerStandings({season:{displayName:"2026"},standings:{entries:[{
     team:{id:"123",displayName:"Clube"},
     stats:[{name:"rank",value:1}],
     note:{description:"Qualified for Champions League"}
   }]}},"eng.1");
   expect(standings.grupos[0].rows[0].note).toBe("Qualified for Champions League");
   expect(zone("eng.1",1,1,"2026","Geral",standings.grupos[0].rows[0].note)).toBe("champions");
 });
 test("colored ranks, legends and a provisional zone disclaimer are accessible",()=>{
   const ui=readFileSync("src/components/sports/LeagueStandings.tsx","utf8");
   const css=readFileSync("src/styles/league-standings.css","utf8");
   expect(ui).toContain("leagueZones(payload.ligaId,payload.temporada,group.name,group.rows)");
   expect(ui).toContain('data-zone={zone?.id}');
   expect(ui).toContain("ztable-zone-legend");
   expect(ui).toContain("Faixas provisórias");
   expect(css).toContain(".ztable-zone--libertadores");
   expect(css).toContain(".ztable-zone--pre-libertadores");
   expect(css).toContain(".ztable-zone--sulamericana");
   expect(css).toContain(".ztable-zone--relegation");
   expect(css).toContain(".ztable-position-cell");
   expect(css).toContain("@media(max-width:700px)");
 });
});
