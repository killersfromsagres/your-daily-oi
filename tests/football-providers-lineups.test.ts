// tests/football-providers-lineups.test.ts — no fake fixtures, real lineup source status.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mergeProviderFixtures, sportsDbToFixture } from "../src/lib/football-backup";
import { broadcastersForBrazil } from "../src/lib/football-broadcasts";
import { groupPosition, parseSportsDbLineups, parseESPNLineups, validLineupId } from "../src/lib/football-lineups";
const date="2026-11-13";
const match={
  idEvent:"2442829",dateEvent:date,strTimestamp:"2026-11-13T19:45:00",
  strHomeTeam:"Serbia",strAwayTeam:"Germany",strLeague:"UEFA Nations League",idLeague:"4490",
  strHomeTeamBadge:"https://r2.thesportsdb.com/a.png",
  strAwayTeamBadge:"http://untrusted.example/b.png",
};
describe("multi-provider football fixtures",()=>{
  test("backfills international fixtures absent from ESPN without inventing scores or TV channels",()=>{
    const game=sportsDbToFixture(match,date);
    expect(game?.id).toBe("sportsdb:2442829");
    expect(game?.liga).toBe("UEFA Nations League");
    expect(game?.placarCasa).toBeNull();
    expect(game?.canalId).toBeNull();
    expect(game?.escudoCasa).toContain("thesportsdb");
    expect(game?.escudoFora).toBeUndefined();
  });
  test("honors Brasília date and rejects malformed identity",()=>{
    expect(sportsDbToFixture(match,"2026-11-14")).toBeNull();
    expect(sportsDbToFixture({...match,idEvent:"javascript:evil"},date)).toBeNull();
  });
  test("does not duplicate an existing ESPN game with the same matchup and kickoff",()=>{
    const backup=sportsDbToFixture(match,date)!;
    const espn={...backup,id:"uefa.nations:456",escudoCasa:undefined};
    const merged=mergeProviderFixtures([espn],[backup]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(espn.id);
    expect(merged[0].escudoCasa).toBe(backup.escudoCasa);
  });
  test("Brazil-only channel names: never label Serbian or European stations as Brazilian",()=>{
    expect(broadcastersForBrazil([
      {strCountry:"Serbia",strChannel:"RTS 1 RS"},
      {strCountry:"Europe",strChannel:"UEFA TV"},
      {strCountry:"Brazil",strChannel:"Premiere"},
      {strCountry:"Brasil",strChannel:"SporTV"},
    ])).toEqual(["Premiere","SporTV"]);
  });
});
describe("published lineups only",()=>{
  test("empty lineup remains pending instead of making up eleven players",()=>{
    const payload=parseSportsDbLineups("sportsdb:2442829",[]);
    expect(payload.disponivel).toBe(false);
    expect(payload.completa).toBe(false);
  });
  test("partial free response keeps player photos and position but clearly labels partial",()=>{
    const input=[
      {idPlayer:"1",strPlayer:"Jogador A",strTeam:"Mandante",strHome:"Yes",strSubstitute:"No",strPosition:"Goalkeeper",intSquadNumber:1,strCutout:"https://r2.thesportsdb.com/a.png"},
      {idPlayer:"2",strPlayer:"Técnico A",strTeam:"Mandante",strHome:"Yes",strPosition:"Manager",strSubstitute:"No"},
      {idPlayer:"3",strPlayer:"Jogador B",strTeam:"Visitante",strHome:"No",strPosition:"Defender",strSubstitute:"No"},
    ];
    const payload=parseSportsDbLineups("sportsdb:456",input);
    expect(payload.disponivel).toBe(true);
    expect(payload.completa).toBe(false);
    expect(payload.equipes).toHaveLength(2);
    expect(payload.equipes[0].starting).toHaveLength(1);
    expect(payload.equipes[0].starting[0].photo).toContain("thesportsdb");
    expect(payload.equipes[0].coach?.name).toBe("Técnico A");
    expect(payload.equipes[1].starting[0].group).toBe("DEF");
  });
  test("ESPN confirms only explicitly tagged starters",()=>{
    const base={
      team:{displayName:"Mandante"},roster:[
        {athlete:{id:"42",displayName:"Titular",headshot:{href:"https://a.espncdn.com/42.png"}},position:{name:"Midfielder"},starter:true},
        {athlete:{id:"43",displayName:"Reserva"},position:{name:"Attacker"},starter:false},
      ],coaches:[{displayName:"Treinador",headshot:{href:"https://a.espncdn.com/coach.png"}}]
    };
    const data=parseESPNLineups("bra.1:12345",{rosters:[base,{...base,team:{displayName:"Visitante"}}]});
    expect(data.equipes[0].starting).toHaveLength(1);
    expect(data.equipes[0].substitutes).toHaveLength(1);
    expect(data.equipes[0].coach?.name).toBe("Treinador");
    expect(data.completa).toBe(false);
  });
  test("rejects non-whitelisted league identifiers and remote URLs",()=>{
    expect(validLineupId("bra.1:12345")).toBe(true);
    expect(validLineupId("sportsdb:2442829")).toBe(true);
    expect(validLineupId("http://localhost/private")).toBe(false);
    expect(validLineupId("hacker:12345")).toBe(false);
  });
  test("position matching and the 50/50 player pitch are present",()=>{
    expect(groupPosition("Goalkeeper")).toBe("GOL");
    expect(groupPosition("Centre-Back")).toBe("DEF");
    expect(groupPosition("Midfielder")).toBe("MEI");
    expect(groupPosition("Striker")).toBe("ATA");
    const ui=readFileSync("src/components/sports/MatchLineups.tsx","utf8");
    const css=readFileSync("src/styles/match-lineups.css","utf8");
    expect(ui).toContain('className="zlineup-pitch"');
    expect(ui).toContain('side="home"');
    expect(ui).toContain('side="away"');
    expect(css).toContain("grid-template-columns:minmax(0,1fr) minmax(0,1fr)");
  });
});
