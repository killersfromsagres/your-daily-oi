import { describe, expect, test } from "bun:test";
import { getMatchCardVisual } from "../src/lib/match-card-visual";
import type { JogoBrasileirao } from "../src/lib/jogos-match";

const start = Date.parse("2026-11-18T21:30:00-03:00");
const fixture = {
  status:"agendado",
  fase:"agendado",
  faseRotulo:"Agendado",
  inicioIso:new Date(start).toISOString(),
  minuto:null,
  placarCasa:null,
  placarFora:null,
} satisfies Pick<JogoBrasileirao, "status"|"fase"|"faseRotulo"|"inicioIso"|"minuto"|"placarCasa"|"placarFora">;

describe("Premium glass football match card semantics",()=>{
  test("5-minute edge triggers green watch state only at the exact threshold",()=>{
    const prior=getMatchCardVisual(fixture,start-5*60_000-1);
    expect(prior.phase).toBe("scheduled");
    expect(prior.highlightWatch).toBe(false);
    const exact=getMatchCardVisual(fixture,start-5*60_000);
    expect(exact.phase).toBe("soon");
    expect(exact.statusLabel).toBe("EM BREVE");
    expect(exact.highlightWatch).toBe(true);
    expect(exact.remainingLabel).toBe("FALTA 5 MIN");
    expect(getMatchCardVisual(fixture,start-4*60_000).remainingLabel).toBe("FALTA 4 MIN");
    expect(getMatchCardVisual(fixture,start-30_000).remainingLabel).toBe("FALTA 1 MIN");
    expect(getMatchCardVisual(fixture,start).remainingLabel).toBe("COMEÇA EM INSTANTES");
  });
  test("a stale upstream never switches to live based on wall clock alone",()=>{
    const stale=getMatchCardVisual(fixture,start+20*60_000);
    expect(stale.phase).toBe("scheduled");
    expect(stale.statusLabel).toBe("AGENDADO");
    expect(stale.highlightWatch).toBe(false);
    expect(stale.showScore).toBe(false);
  });
  test("SSR/hydration snapshot is deterministic before the browser subscribes",()=>{
    const server=getMatchCardVisual(fixture,0);
    expect(server.phase).toBe("scheduled");
    expect(server.remainingLabel).toBeNull();
    expect(server.highlightWatch).toBe(false);
  });
  test("only official live scores are displayed, with phases and minutes unchanged",()=>{
    const live=getMatchCardVisual({
      ...fixture,status:"ao-vivo",fase:"segundo-tempo",faseRotulo:"2º tempo",
      minuto:"67′",placarCasa:1,placarFora:0,
    },start+73*60_000);
    expect(live.phase).toBe("live");
    expect(live.showScore).toBe(true);
    expect(live.scoreHome).toBe("1");
    expect(live.scoreAway).toBe("0");
    expect(live.periodLabel).toBe("2º tempo");
    expect(live.highlightWatch).toBe(false);
  });
  test("halftime, final and postponed never glow as upcoming",()=>{
    const half=getMatchCardVisual({
      ...fixture,status:"ao-vivo",fase:"intervalo",faseRotulo:"Intervalo",
      placarCasa:0,placarFora:0,
    },start-3*60_000);
    expect(half.statusLabel).toBe("INTERVALO");
    expect(half.showScore).toBe(true);
    const final=getMatchCardVisual({
      ...fixture,status:"encerrado",fase:"encerrado",placarCasa:2,placarFora:1,
    },start-2*60_000);
    expect(final.phase).toBe("finished");
    expect(final.showScore).toBe(true);
    expect(final.highlightWatch).toBe(false);
    const postponed=getMatchCardVisual({...fixture,status:"adiado",fase:"adiado"},start-3*60_000);
    expect(postponed.statusLabel).toBe("ADIADO");
    expect(postponed.highlightWatch).toBe(false);
  });
  test("does not manufacture a score when the live provider has no goals",()=>{
    const withoutScore=getMatchCardVisual({
      ...fixture,status:"ao-vivo",fase:"primeiro-tempo",placarCasa:null,placarFora:2,
    },start+30_000);
    expect(withoutScore.phase).toBe("live");
    expect(withoutScore.showScore).toBe(false);
    expect(withoutScore.scoreHome).toBe("—");
    expect(withoutScore.scoreAway).toBe("—");
  });
  test("invalid start times never illuminate watch buttons",()=>{
    expect(getMatchCardVisual({...fixture,inicioIso:"unknown"},start).highlightWatch).toBe(false);
  });
});
