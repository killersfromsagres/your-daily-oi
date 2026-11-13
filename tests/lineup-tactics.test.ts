import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamLineupBoard } from "../src/components/sports/TeamLineupBoard";
import { buildTacticalLayout, positionBadge } from "../src/lib/lineup-tactics";
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
  test("renders 4-3-3 and 3-5-2 as published, but never fills a partial XI",()=>{
    for(const [formation,counts] of [["4-3-3",[1,4,3,3]],["3-5-2",[1,3,5,2]]] as const) {
      expect(buildTacticalLayout({...team,formation}).rows.map(r=>r.players.length)).toEqual([...counts]);
    }
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
    const crowded=buildTacticalLayout({...team,formation:null,starting:starting.map(p=>({...p,group:"MEI"}))});
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
