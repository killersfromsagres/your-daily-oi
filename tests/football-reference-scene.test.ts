import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  footballCompetitions, selectedFootballLeague, FootballSceneHeader,
} from "../src/components/sports/FootballSceneHeader";
import { readFileSync } from "node:fs";

const game = (ligaId:string, status:"agendado"|"ao-vivo" = "agendado",
  casa="Cruzeiro",fora="Palmeiras") => ({
  ligaId,status,casa,fora,liga:ligaId==="bra.1"?"Brasileirão Série A":
    ligaId==="uefa.champions"?"UEFA Champions League":"Amistosos de seleções",
});
const brRound=[game("bra.1"),game("bra.1"),game("bra.1"),game("bra.1")];

describe("Football stadium-reference section",()=>{
  test("a genuine Série A round is selected by default like the design",()=>{
    expect(selectedFootballLeague(brRound,"auto")).toBe("bra.1");
    expect(selectedFootballLeague(brRound,"all")).toBe("all");
    expect(selectedFootballLeague(brRound,"bra.1")).toBe("bra.1");
  });
  test("live Champions League and Brazil national fixtures are never hidden by auto-filter",()=>{
    expect(selectedFootballLeague([...brRound,game("uefa.champions","ao-vivo")],"auto")).toBe("all");
    expect(selectedFootballLeague([...brRound,game("fifa.friendly","agendado","Brasil","Japão")],"auto")).toBe("all");
    expect(selectedFootballLeague([game("uefa.champions")],"auto")).toBe("all");
  });
  test("invalid or missing filters revert to all instead of showing blank cards",()=>{
    expect(selectedFootballLeague(brRound,"uefa.champions")).toBe("all");
    expect(selectedFootballLeague([],"auto")).toBe("all");
  });
  test("competition dropdown uses actual matches and deduplicates display names",()=>{
    const options=footballCompetitions([...brRound,game("uefa.champions"),game("uefa.champions")]);
    expect(options.map(x=>x.ligaId)).toEqual(["bra.1","uefa.champions"]);
    const html=renderToStaticMarkup(createElement(FootballSceneHeader,{
      games:[...brRound,game("uefa.champions")],
      selection:"bra.1",
      onChange:()=>{},
    }));
    expect(html).toContain("Jogos de Hoje");
    expect(html).toContain("ASSISTA AO VIVO AO BRASILEIRÃO SÉRIE A");
    expect(html).toContain('aria-label="Filtrar jogos por campeonato"');
    expect(html).toContain('value="uefa.champions"');
    expect(html).toContain("zf-scene-title-bar");
    expect(html).toContain("zf-scene-league-picker");
  });
  test("both routes use the actual reference scene and hide calendars inside details",()=>{
    const shelf=readFileSync("src/components/tv/JogosShelf.tsx","utf8");
    const page=readFileSync("src/routes/futebol.tsx","utf8");
    const css=readFileSync("src/styles/football-reference-scene.css","utf8");
    expect(shelf).toContain('className="zf-reference-scene"');
    expect(shelf).toContain("zf-reference-cards");
    expect(shelf).toContain('details className="zf-reference-calendar"');
    expect(shelf).toContain("selectedFootballLeague(allGames,leagueFilter)");
    expect(page).toContain('className="zf-football-page zf-football-reference-page"');
    expect(page).toContain("selectedFootballLeague(games,leagueFilter)");
    expect(page).toContain("visibleGames.filter");
    expect(css).toContain(".zf-reference-section .zf-reference-cards");
    expect(css).toContain("backdrop-filter:blur(16px)");
    expect(css).toContain("@media(max-width:650px)");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).not.toContain("content:'ZANG FLIX'");
  });
});
