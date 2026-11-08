// tests/football-live.test.ts — Bun, match score merge and live polling regression cases.
import { describe, expect, test } from "bun:test";
import { liveScoreLeagueIds, mergeFootballScores } from "../src/lib/football-ranking";
import type { JogoBrasileirao } from "../src/lib/jogos-match";

const start = "2026-11-08T20:00:00.000Z";
function game(id: string, status: JogoBrasileirao["status"] = "agendado"): JogoBrasileirao {
  return {
    id, casa: "Flamengo", fora: "Palmeiras",
    escudoCasa: undefined, escudoFora: undefined,
    inicioIso: start, dataLocal: "2026-11-08", horarioLocal: "17:00",
    rodada: undefined, liga: "Brasileirão Série A", ligaId: "bra.1",
    ligaLogo: null, grupo: "brasileirao", status,
    fase: status==="ao-vivo" ? "primeiro-tempo" : "agendado",
    faseRotulo: status==="ao-vivo" ? "1º tempo" : "Agendado",
    minuto: status==="ao-vivo" ? "10′" : null,
    placarCasa: null, placarFora: null,
    destaque: true, canalId: null, canalNome: null,
    canalLogo: null, transmissao: "nao-confirmada",
  };
}

describe("Live match scoreboard updates",()=>{
  test("preserves the confirmed TV channel and refreshes goals, minute and phase",()=>{
    const agenda = {...game("bra.1:123","ao-vivo"),
      canalId:"premiere",canalNome:"Premiere",canalLogo:"https://example.com/p.png",
      transmissao:"confirmada" as const, placarCasa:0, placarFora:0};
    const feed = {...game("bra.1:123","ao-vivo"),placarCasa:2,placarFora:1,
      fase:"segundo-tempo" as const,faseRotulo:"2º tempo",minuto:"68′"};
    const [result] = mergeFootballScores([agenda],[feed],"2026-11-08");
    expect(result?.canalId).toBe("premiere");
    expect(result?.placarCasa).toBe(2);
    expect(result?.placarFora).toBe(1);
    expect(result?.fase).toBe("segundo-tempo");
    expect(result?.minuto).toBe("68′");
  });

  test("recovers fixtures that were not in the last full agenda",()=>{
    const old=game("bra.1:1");
    const additional={...game("arg.1:2","ao-vivo"),ligaId:"arg.1",placarCasa:1,placarFora:0};
    expect(mergeFootballScores([old],[additional],"2026-11-08").map(g=>g.id)).toEqual(["bra.1:1","arg.1:2"]);
  });

  test("does not mix match dates or regress running matches to scheduled",()=>{
    const active={...game("bra.1:1","ao-vivo"),placarCasa:1,placarFora:0};
    const old={...game("bra.1:1"),placarCasa:null,placarFora:null};
    const other={...game("bra.1:2"),dataLocal:"2026-11-09"};
    const merged=mergeFootballScores([active],[old,other],"2026-11-08");
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("ao-vivo");
    expect(merged[0]?.placarCasa).toBe(1);
  });

  test("0-0 is a valid live score, not an absent score",()=>{
    const original=game("bra.1:1");
    const latest={...game("bra.1:1","ao-vivo"),placarCasa:0,placarFora:0};
    expect(mergeFootballScores([original],[latest],"2026-11-08")[0]?.placarCasa).toBe(0);
  });

  test("polls only matches currently running or near kickoff",()=>{
    const running={...game("esp.1:3","ao-vivo"),ligaId:"esp.1"};
    const soon={...game("bra.1:4"),ligaId:"bra.1"};
    const later={...game("uefa.champions:7"),ligaId:"uefa.champions",
      inicioIso:"2026-11-12T20:00:00.000Z"};
    const finished={...game("eng.1:5","encerrado"),ligaId:"eng.1"};
    expect(liveScoreLeagueIds([running,soon,later,finished],Date.parse(start))).toEqual(["bra.1","esp.1"]);
  });
});
