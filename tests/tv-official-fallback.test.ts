import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifiedBroadcastEvidence } from "../src/lib/broadcast-verified";

describe("Premiere is an internal player channel, never a web-page-as-video fallback", () => {
  test("live playback error screen stays in ZANG FLIX and offers retry", () => {
    const source = readFileSync(new URL("../src/components/player/LivePlayer.tsx", import.meta.url), "utf8");
    expect(source).toContain("{error && (");
    expect(source).toContain("Nenhum servidor disponível para este canal");
    expect(source).toContain("Limpar Cache e Tentar Novamente");
    expect(source).not.toContain("officialTvFallback");
    expect(source).not.toContain("Assistir no Premiere oficial (requer assinatura)");
    expect(source).not.toContain("href={officialFallbackUrl}");
  });
  test("live Premiere fixtures are resolved by guide and EPG, not hardcoded redirects", () => {
    const proof = verifiedBroadcastEvidence({
      casa: "Corinthians", fora: "Botafogo", dataLocal: "2026-11-18",
    });
    expect(proof).toBeNull();
    const api=readFileSync(new URL("../src/lib/jogos.ts", import.meta.url),"utf8");
    expect(api).toContain("localizarJogosNaGradeEPG");
  });
});
