// tests/sports-ticket-lineup.test.ts — one-club lineup UI and premium match-ticket regression.
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamLineupBoard } from "../src/components/sports/TeamLineupBoard";
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
  test("English provider team names identify Brazil and Japan without switching lineups",()=>{
    const data={...lineup,equipes:[{...home,name:"Brazil"},{...away,name:"Japan"}]};
    expect(selectLineupTeam({casa:"Japão",fora:"Brasil"},data,"home")?.name).toBe("Japan");
    expect(selectLineupTeam({casa:"Japão",fora:"Brasil"},data,"away")?.name).toBe("Brazil");
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
    expect(component).toContain("game.canaisDisponiveis");
    expect(component).toContain("isBrazilFixture(game)");
  });
  test("one Escalação button opens the dialog with two crest-backed team tabs",()=>{
    const component=readFileSync("src/components/sports/MatchLineups.tsx","utf8");
    expect(component).toContain('className="zf-lineup-single-button"');
    expect(component).toContain("setSide(\"home\");setError(null)");
    expect(component).toContain('className="zf-lineup-pair-crests"');
    expect(component).toContain('onClick={()=>setSide("home")}');
    expect(component).toContain('onClick={()=>setSide("away")}');
    expect(component).toContain('createPortal(');
    expect(component).not.toContain('preview("home")');
    expect(component).not.toContain("zlineup-half--");
  });
  test("field keeps the goalkeeper area and removes the attacking goal marking",()=>{
    const html=renderToStaticMarkup(createElement(TeamLineupBoard,{team:home}));
    expect(html).toContain('zf-formation-top-box');
    expect(html).not.toContain('zf-formation-bottom-box');
    expect(html).toContain('Sentido do ataque');
    expect(html).toContain('Cores das posições');
    expect(html).toContain('zf-formation-watermark');
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
