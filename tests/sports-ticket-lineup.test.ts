// tests/sports-ticket-lineup.test.ts — one-club lineup UI and premium match-ticket regression.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { selectLineupTeam } from "../src/lib/lineup-selection";
import type { MatchLineups } from "../src/lib/football-lineups";
import { parseESPNFixture, LIGAS_FUTEBOL } from "../src/lib/jogos-match";

const home = {name:"Flamengo",formation:"4-3-3",crest:null,coach:null,starting:[],substitutes:[]};
const away = {name:"Bahia",formation:"4-4-2",crest:null,coach:null,starting:[],substitutes:[]};
const lineup: MatchLineups = { jogo:"bra.1:12345",atualizadoEm:"2026-11-13T18:00:00Z",
  disponivel:false,completa:false,origem:"ESPN",mensagem:"Aguardando",equipes:[away,home] };
const game={casa:"Flamengo",fora:"Bahia"};

describe("match lineup single team selector",()=>{
  test("detects the home team when ESPN returns away-first order",()=>{
    expect(selectLineupTeam(game,lineup,"home")).toBe(home);
    expect(selectLineupTeam(game,lineup,"away")).toBe(away);
  });
  test("does not attribute unknown roster to the wrong club",()=>{
    const unknown={...lineup,equipes:[{...home,name:"Unknown Club"},{...away,name:"Another Club"}]};
    expect(selectLineupTeam(game,unknown,"home")).toBeNull();
    expect(selectLineupTeam(game,unknown,"away")).toBeNull();
  });
  test("uses one positive opposing match to identify the other team",()=>{
    const labeled={...lineup,equipes:[{...home,name:"Unknown Club"},away]};
    expect(selectLineupTeam(game,labeled,"home")?.name).toBe("Unknown Club");
    expect(selectLineupTeam(game,labeled,"away")).toBe(away);
  });
  test("supports accents and club suffixes",()=>{
    const a={...home,name:"São Paulo Futebol Clube"};
    expect(selectLineupTeam({casa:"São Paulo",fora:"Bahia"},{...lineup,equipes:[away,a]},"home")).toBe(a);
  });
});
describe("match ticket and tactical field",()=>{
  test("the new card retains channel navigation and visible TV status",()=>{
    const component=readFileSync("src/components/tv/JogosShelf.tsx","utf8");
    expect(component).toContain("zf-ticket-watch");
    expect(component).toContain("if(game.canalId)onWatch(game.canalId)");
    expect(component).toContain("zf-ticket-watermark");
    expect(component).toContain("ZANG <span>FLIX</span>");
    expect(component).toContain("game.estadio?.trim()");
  });
  test("home and away are independent lineup buttons",()=>{
    const component=readFileSync("src/components/sports/MatchLineups.tsx","utf8");
    expect(component).toContain('preview("home")');
    expect(component).toContain('preview("away")');
    expect(component).toContain('onClick={()=>setSide("home")}');
    expect(component).toContain('onClick={()=>setSide("away")}');
    expect(component).toContain('createPortal(');
    expect(component).not.toContain("zlineup-half--");
  });
  test("field renders one team, in goalkeeper-to-attack order",()=>{
    const field=readFileSync("src/components/sports/TeamLineupBoard.tsx","utf8");
    const css=readFileSync("src/styles/sports-ticket-lineup.css","utf8");
    expect(field).toContain("team.starting.filter(player => player.group === group)");
    expect(field.indexOf('group: "GOL"')).toBeLessThan(field.indexOf('group: "ATA"'));
    expect(field).toContain("zf-formation-watermark");
    expect(css).toContain("grid-template-rows:repeat(4,1fr)");
    expect(css).toContain("width:min(720px,100%)");
  });
  test("responsive tickets and separate dialog accessibility are present",()=>{
    const css=readFileSync("src/styles/sports-match-tickets.css","utf8");
    const dialog=readFileSync("src/components/sports/MatchLineups.tsx","utf8");
    expect(css).toContain(".zgame-card.zf-ticket");
    expect(css).toContain("backdrop-filter:blur(18px)");
    expect(css).toContain("zgame-grid,.zf-football-page .zf-football-grid");
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('event.key==="Escape"');
    expect(dialog).toContain("previousFocus.current?.focus()");
  });
  test("only displays the stadium supplied by the real ESPN event",()=>{
    const league=LIGAS_FUTEBOL[0];
    const base={id:"123",date:"2026-11-13T20:00:00Z",competitions:[{
      date:"2026-11-13T20:00:00Z",
      competitors:[
        {homeAway:"home",team:{displayName:"Flamengo"}},
        {homeAway:"away",team:{displayName:"Bahia"}},
      ],
      venue:{fullName:"Maracanã"},
    }]};
    const parsed=parseESPNFixture(base,league,"2026-11-13");
    expect(parsed?.estadio).toBe("Maracanã");
    const without=parseESPNFixture({...base,competitions:[{...base.competitions[0],venue:undefined}]},league,"2026-11-13");
    expect(without?.estadio).toBeUndefined();
  });
});
