import {describe,expect,test} from "bun:test";
import { parseSoccerStandings } from "../src/lib/standings";
const row=(id:string,name:string,rank:number)=>({
 team:{id,displayName:name,logos:[{href:"https://a.espncdn.com/a.png"}]},
 stats:[{name:"rank",value:rank},{name:"points",value:40},{name:"gamesPlayed",value:19},
 {name:"wins",value:12},{name:"ties",value:4},{name:"losses",value:3},{name:"pointDifferential",value:18}],
});
describe("Standings group parsing",()=>{
 test("keeps position, stats, season and independent groups",()=>{
   const result=parseSoccerStandings({season:{displayName:"2026"},children:[
    {id:"g1",name:"Grupo A",standings:{entries:[row("1","Clube 1",1),row("2","Clube 2",2)]}},
    {id:"g2",name:"Grupo B",standings:{entries:[row("3","Clube 3",1)]}},
   ]},"bra.1");
   expect(result.grupos).toHaveLength(2);
   expect(result.grupos[0].rows[0].points).toBe(40);
   expect(result.grupos[0].rows[0].goalDifference).toBe(18);
   expect(result.temporada).toBe("2026");
 });
 test("handles missing stats honestly, empty table and invalid competition",()=>{
   const result=parseSoccerStandings({standings:{entries:[{team:{id:"4",displayName:"Equipe X"}}]}},"eng.1");
   expect(result.grupos[0].rows[0].points).toBeNull();
   expect(()=>parseSoccerStandings({},"bra.1")).toThrow();
   expect(()=>parseSoccerStandings({},"imaginary.league")).toThrow(RangeError);
 });
});
