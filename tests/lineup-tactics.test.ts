import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamLineupBoard } from "../src/components/sports/TeamLineupBoard";
import { buildTacticalLayout, positionBadge } from "../src/lib/lineup-tactics";
import fixture from "./fixtures/espn-moldova-kazakhstan-lineups.json";
import { groupPosition, parseESPNLineups } from "../src/lib/football-lineups";
import type { LineupPlayer, LineupTeam, PlayerPosition } from "../src/lib/football-lineups";

const player=(id:number, group:PlayerPosition, position:string=group):LineupPlayer=>({
  id:String(id),name:"Jogador "+id,number:String(id),group,position,photo:null,grid:null,
});
const starting=[player(1,"GOL"),...Array.from({length:4},(_,i)=>player(i+2,"DEF")),
  player(6,"MEI","Defensive Midfielder"),player(7,"MEI","Defensive Midfielder"),
  player(8,"MEI","Right Midfielder"),player(9,"MEI","Attacking Midfielder"),
  player(10,"MEI","Left Midfielder"),player(11,"ATA")];
const team:LineupTeam={name:"Equipe de teste",formation:"4-2-3-1",crest:null,coach:null,substitutes:[],starting};

describe("tactical formation and position orbs",()=>{
  test("splits defensive and attacking midfield lines without losing players",()=>{
    const result=buildTacticalLayout(team);
    expect(result.source).toBe("formation");
    expect(result.rows.map(row=>row.players.length)).toEqual([1,4,2,3,1]);
    expect(result.rows[2].players.map(p=>p.id)).toEqual(["6","7"]);
    expect(result.rows.flatMap(row=>row.players).map(p=>p.id).sort()).toEqual(starting.map(p=>p.id).sort());
    expect(team.starting).toEqual(starting);
  });
  test("requires roles to agree with 4-3-3 and 3-5-2 instead of relocating players to fill slots",()=>{
    for(const [formation,groups,counts] of [
      ["4-3-3",["GOL",...Array(4).fill("DEF"),...Array(3).fill("MEI"),...Array(3).fill("ATA")],[1,4,3,3]],
      ["3-5-2",["GOL",...Array(3).fill("DEF"),...Array(5).fill("MEI"),...Array(2).fill("ATA")],[1,3,5,2]],
    ] as const) {
      const result=buildTacticalLayout({...team,formation,starting:groups.map((group,i)=>player(i+1,group as PlayerPosition))});
      expect(result.source).toBe("formation");
      expect(result.rows.map(r=>r.players.length)).toEqual([...counts]);
    }
    expect(buildTacticalLayout({...team,formation:"4-3-3"}).source).toBe("sectors");
    const partial=buildTacticalLayout({...team,starting:starting.slice(0,8)});
    expect(partial.source).toBe("sectors");
    expect(partial.rows.flatMap(row=>row.players)).toHaveLength(8);
  });
  test("honors explicit row:column coordinates over the formation string",()=>{
    const result=buildTacticalLayout({...team,starting:[
      {...player(3,"DEF"),grid:"2:2"},{...player(1,"GOL"),grid:"1:1"},
      {...player(2,"DEF"),grid:"2:1"},{...player(4,"ATA"),grid:"4:1"},
    ]});
    expect(result.source).toBe("grid");
    expect(result.rows.map(r=>r.players.map(p=>p.id))).toEqual([["1"],["2","3"],["4"]]);
  });
  test("rejects duplicate coordinates, scalar indices and invalid formations",()=>{
    for(const formation of [null,"4-4-4","1-1","4-NaN-2"]) {
      const result=buildTacticalLayout({...team,formation,starting:starting.map(p=>({...p,grid:"2:1"}))});
      expect(result.source).toBe("sectors");
      expect(result.rows.flatMap(r=>r.players)).toHaveLength(11);
    }
    expect(buildTacticalLayout({...team,starting:starting.map(p=>({...p,grid:p.id}))}).source).toBe("formation");
  });
  test("caps crowded fallback sectors and preserves all announced names",()=>{
    const crowded=buildTacticalLayout({...team,formation:null,starting:starting.map(p=>({...p,group:"MEI",position:"Midfielder"}))});
    expect(crowded.rows.map(r=>r.players.length)).toEqual([5,5,1]);
    expect(buildTacticalLayout({...team,starting:[]}).rows).toEqual([]);
  });
  test("localizes position abbreviations without fabricating grades or condition",()=>{
    for(const [group,position,code] of [
      ["GOL","Goalkeeper","GOL"],["DEF","Right Back","LD"],["DEF","Left Back","LE"],
      ["DEF","Centre-Back","ZAG"],["MEI","Defensive Midfielder","VOL"],
      ["MEI","Attacking Midfielder","MAT"],["ATA","Right Winger","PD"],
      ["ATA","Left Winger","PE"],["ATA","Second Striker","SA"],
    ] as const) expect(positionBadge(player(1,group,position)).code).toBe(code);
    const html=renderToStaticMarkup(createElement(TeamLineupBoard,{team}));
    expect((html.match(/class="zf-formation-player"/g)||[]).length).toBe(11);
    expect(html).toContain('aria-label="Volante"');
    expect(html).toContain('data-sector="GOL"');
    expect(html).toContain('data-sector="ATA"');
    expect(html).toContain('data-layout="formation"');
    expect(html).not.toContain('zf-formation-bottom-box');
  });
});

describe("real Moldova–Kazakhstan match 401861162 regression",()=>{
  const data=parseESPNLineups("uefa.nations:401861162",fixture);
  test("Kazakhstan keeps three central defenders and both real full-backs",()=>{
    const kaz=data.equipes.find(t=>t.name==="Kazakhstan")!;
    const result=buildTacticalLayout(kaz);
    expect(result.source).toBe("formation");
    expect(result.rows.map(row=>row.players.length)).toEqual([1,5,3,2]);
    expect(result.rows[1]!.players.map(p=>[p.name,positionBadge(p).code])).toEqual([
      ["Nauryzbek Zhagorov","LE"], ["Nuraly Alip","ZAG"], ["Temirlan Erlanov","ZAG"],
      ["Alibek Kasym","ZAG"], ["Aleksandr Mrynskiy","LD"],
    ]);
    expect(result.rows[2]!.players.map(p=>[p.name,positionBadge(p).code])).toEqual([
      ["Zhasulan Amir","MC"], ["Dinmuhamed Karaman","MC"], ["Ramazan Orazov","MC"],
    ]);
    expect(result.rows[3]!.players.map(p=>positionBadge(p).code)).toEqual(["CA","CA"]);
  });
  test("Moldova has Oleg Reabciuk at left-back and Iurie Iovu at center-back",()=>{
    const moldova=data.equipes.find(t=>t.name==="Moldova")!;
    const result=buildTacticalLayout(moldova);
    expect(result.rows[1]!.players.map(p=>[p.name,positionBadge(p).code])).toEqual([
      ["Oleg Reabciuk","LE"], ["Mihail Gherasimencov","ZAG"], ["Iurie Iovu","ZAG"],
      ["Vladislav Baboglo","ZAG"], ["Ioan-Calin Revenco","LD"],
    ]);
  });
  test("shuffling source roster order cannot move full-backs into central slots",()=>{
    for(const team of data.equipes){
      const expected=buildTacticalLayout(team).rows.map(r=>r.players.map(p=>p.id));
      expect(buildTacticalLayout({...team,starting:[...team.starting].reverse()}).rows.map(r=>r.players.map(p=>p.id))).toEqual(expected);
    }
  });
  test("the displayed role and orb also ignore an erroneous cached group",()=>{
    const p=player(1,"MEI","Center Left Defender");
    const role=positionBadge(p);
    expect(role.group).toBe("DEF");expect(role.code).toBe("ZAG");
    const html=renderToStaticMarkup(createElement(TeamLineupBoard,{team:{...team,starting:[p]}}));
    expect(html).toContain('data-sector="DEF" data-position="ZAG"');
  });
});
describe("provider position vocabulary and safe fallbacks",()=>{
  test("central roles retain their role even with a left/right modifier or ESPN abbreviation",()=>{
    for(const role of ["Center Left Defender","Center Right Defender","Left Centre-Back","Right Centre Back","CD-L","CD-R","LCB","RCB"]){
      expect(positionBadge(player(1,"DEF",role)).code).toBe("ZAG");
      expect(groupPosition(role)).toBe("DEF");
    }
    for(const role of ["Center Left Forward","Center Right Forward","CF-L","CF-R"]) expect(positionBadge(player(1,"ATA",role)).code).toBe("CA");
    for(const role of ["Center Left Midfielder","Center Right Midfielder","CM-L","CM-R"]) expect(positionBadge(player(1,"MEI",role)).code).toBe("MC");
  });
  test("unknowns and substitute labels are not reported as midfielders",()=>{
    for(const role of ["", "Substitute", "Posição não informada", "n/a", "Unexpected provider role"]){
      expect(groupPosition(role)).toBe("ND");
      expect(positionBadge(player(1,"MEI",role)).label).toBe("Posição não informada");
    }
    const result=buildTacticalLayout({...team,starting:[player(99,"MEI","Substitute")]});
    expect(result.rows[0]!.label).toBe("Posição não informada");
  });
  test("does not split indistinguishable midfielders into arbitrary tactical lines",()=>{
    const generic=starting.map(p=>p.group==="MEI"?{...p,position:"Midfielder"}:p);
    expect(buildTacticalLayout({...team,starting:generic}).source).toBe("sectors");
  });
  test("can place explicitly identified wing-backs in the midfield line of a 3-5-2",()=>{
    const group=[player(1,"GOL"),player(2,"DEF","Center Left Defender"),player(3,"DEF","Center Defender"),
      player(4,"DEF","Center Right Defender"),player(5,"DEF","Left Wing-Back"),player(6,"DEF","Right Wing-Back"),
      player(7,"MEI","Center Left Midfielder"),player(8,"MEI","Center Midfielder"),player(9,"MEI","Center Right Midfielder"),
      player(10,"ATA","Center Left Forward"),player(11,"ATA","Center Right Forward")];
    const result=buildTacticalLayout({...team,formation:"3-5-2",starting:group.reverse()});
    expect(result.source).toBe("formation");
    expect(result.rows.map(r=>r.players.length)).toEqual([1,3,5,2]);
    expect(result.rows[2]!.players.map(p=>positionBadge(p).code)).toEqual(["ALE","MC","MC","MC","ALD"]);
  });
});
