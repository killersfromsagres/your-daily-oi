import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { officialBroadcastTarget } from "../src/lib/official-broadcast";
import { verifiedBroadcastEvidence, broadcastTeamKey } from "../src/lib/broadcast-verified";
import { matchBrazilianBroadcastChannel } from "../src/lib/broadcast-match";

const game = { casa: "Corinthians", fora: "Botafogo", dataLocal: "2026-11-18" };

describe("Corinthians x Botafogo dynamically resolved broadcaster", () => {
  test("does not override the live broadcaster research with hardcoded Premiere rights", () => {
    expect(verifiedBroadcastEvidence(game)).toBeNull();
    const source=readFileSync("src/lib/jogos.ts","utf8");
    expect(source).toContain("getGuideBroadcasts(date)");
    expect(source).toContain("localizarJogosNaGradeEPG(matches, available)");
    expect(source).toContain("brBroadcastsFromESPN(fixture.raw)");
  });

  test("handles scoreboard home/away ordering and provider team aliases", () => {
    expect(broadcastTeamKey("SC Corinthians SP")).toBe("corinthians");
    expect(broadcastTeamKey("Botafogo RJ")).toBe("botafogo");
    expect(verifiedBroadcastEvidence({
      casa: "Botafogo RJ", fora: "SC Corinthians SP", dataLocal: "2026-11-18",
    })).toBeNull();
  });

  test("does not carry broadcaster rights over to unrelated fixtures or dates", () => {
    expect(verifiedBroadcastEvidence({ ...game, dataLocal: "2026-11-19" })).toBeNull();
    expect(verifiedBroadcastEvidence({ ...game, fora: "Santos" })).toBeNull();
    expect(verifiedBroadcastEvidence({ casa: "Botafogo SP", fora: "Corinthians", dataLocal: game.dataLocal })).toBeNull();
  });

  test("never misroutes generic Premiere to arbitrary Premiere 2 or Premiere 3", () => {
    const catalogue = [
      { id: "premiere-2", nome: "Premiere 2 HD", fontes: [{ url: "https://licensed.example/2.m3u8" }] },
      { id: "premiere-3", nome: "Premiere 3 HD", fontes: [{ url: "https://licensed.example/3.m3u8" }] },
    ];
    expect(matchBrazilianBroadcastChannel("Premiere", catalogue)).toBeNull();
    expect(matchBrazilianBroadcastChannel("Premiere 2", catalogue)?.id).toBe("premiere-2");
  });
});

describe("official live sports destination", () => {
  test("allows only the official Premiere subscription page as an external destination", () => {
    const url = "https://globoplay.globo.com/canais/premiere/";
    expect(officialBroadcastTarget(url)).toEqual({href:url,provider:"Premiere",subscriptionRequired:true});
    expect(officialBroadcastTarget("https://globoplay.globo.com:8443/canais/premiere/")).toBeNull();
  });

  test("uses date-scoped verified broadcaster for Atletico-MG x Corinthians", () => {
    const fixture = {casa:"Atletico Mineiro MG",fora:"SC Corinthians SP",dataLocal:"2026-11-25"};
    const evidence = verifiedBroadcastEvidence(fixture);
    expect(evidence?.names).toEqual(["Premiere"]);
    expect(evidence?.exclusive).toBe(true);
    expect(officialBroadcastTarget(evidence?.watchUrl)?.provider).toBe("Premiere");
    expect(verifiedBroadcastEvidence({...fixture,dataLocal:"2026-11-26"})).toBeNull();
    expect(verifiedBroadcastEvidence({...fixture,fora:"Santos"})).toBeNull();
  });

  test("keeps the already verified Prime Video fixture working", () => {
    const url = "https://www.primevideo.com/detail/0SAJWPZH2WON1C43SOHFWQBD4D";
    expect(officialBroadcastTarget(url)?.href).toBe(url);
  });

  test("rejects arbitrary iframe sources and forged publisher domains", () => {
    for (const url of [
      "https://globoplay.globo.com.example.com/canais/premiere/",
      "https://globoplay.globo.com/canais/premiere/?session=secret",
      "https://www.primevideo.com.evil.tld/detail/123",
      "javascript:alert(1)",
      "https://random-cdn.example/live.m3u8",
    ]) expect(officialBroadcastTarget(url)).toBeNull();
  });

  test("match card exposes official option, multiple channel choices, and playback outcomes", () => {
    const ui = readFileSync("src/components/tv/JogosShelf.tsx", "utf8");
    expect(ui).toContain("officialBroadcastTarget(game.transmissaoUrl)");
    expect(ui).toContain('target="_blank" rel="noopener noreferrer"');
    expect(ui).toContain('channelPlayback?.[ch.id]');
    expect(ui).toContain('TENTAR OUTRA FONTE');
    expect(ui).toContain("Outros canais");
    expect(ui).toContain("onExplore?.(exploreChannel)");
    expect(ui).toContain("TRANSMISSORA ANUNCIADA");
    expect(ui).toContain("<PitchCondition game={game}/>");
    const tvUi=readFileSync("src/components/tv/TvView.tsx","utf8");
    expect(tvUi).toContain('setQuery(channelName || "")');
    expect(tvUi).toContain('setOnlineOnly(false)');
    const scoreboard=readFileSync("src/lib/jogos.ts","utf8");
    expect(scoreboard).toContain("else if (proof?.exclusive) delete parsed.transmissaoUrl;");
  });
});
