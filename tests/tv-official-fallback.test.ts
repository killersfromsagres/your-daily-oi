import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { officialTvFallback } from "../src/lib/tv-official-fallback";

describe("Premiere source outage fallback", () => {
  test("points Premiere 2 and available numbered channels to the broadcaster", () => {
    expect(officialTvFallback("premiere-2")).toBe("https://globoplay.globo.com/v/8221785/");
    expect(officialTvFallback("premiere-3")).toBe("https://globoplay.globo.com/v/8221827/");
    expect(officialTvFallback("premiere-8")).toBe("https://globoplay.globo.com/canais/premiere/");
    expect(officialTvFallback("premiere-clubes")).toBe("https://globoplay.globo.com/canais/premiere/");
  });
  test("never routes unrelated channels to Premiere or invents media URLs", () => {
    expect(officialTvFallback("sbt")).toBeNull();
    expect(officialTvFallback("premiere-fake")).toBeNull();
    expect(officialTvFallback("premiere-2")?.startsWith("https://globoplay.globo.com/")).toBe(true);
  });
  test("offers licensed destination only in the player error state", () => {
    const source = readFileSync(new URL("../src/components/player/LivePlayer.tsx", import.meta.url), "utf8");
    expect(source).toContain("{error && (");
    expect(source).toContain("{officialFallbackUrl && (");
    expect(source).toContain("Assistir no Premiere oficial (requer assinatura)");
    expect(source).toContain('rel="noopener noreferrer"');
  });
});
