import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChannelCard } from "../src/components/tv/ChannelCard";
import type { CanalTV } from "../src/lib/canais";

const channel: CanalTV = {
  id: "esportes-teste",
  nome: "Canal Esportes Teste",
  categoria: "Esportes",
  fontes: [{ url: "https://licensed.example/live.m3u8" }],
};

function card(status?: "connecting" | "playing" | "unavailable"): string {
  return renderToStaticMarkup(createElement(ChannelCard, {
    channel, active: false, favorite: false,
    onSelect: () => {}, onFavorite: () => {},
    listMode: false, nowMs: Date.now(), guideLoading: false,
    ...(status ? {playbackStatus:status} : {}),
  }));
}

describe("Truthful live TV source status", () => {
  test("a catalog URL is not falsely described as verified streaming", () => {
    expect(card()).toContain("Fonte não verificada");
    expect(card()).not.toContain("Reprodução confirmada");
    expect(card()).not.toContain("1 fonte");
  });

  test("only an explicit media-clock-confirmed player status claims playback", () => {
    expect(card("playing")).toContain("Reprodução confirmada");
    expect(card("connecting")).toContain("Verificando fonte");
  });

  test("failed channels show a retry opportunity, not a fake playability badge", () => {
    const html = card("unavailable");
    expect(html).toContain("Indisponível na última tentativa");
    expect(html).toContain("Tentar novamente");
    expect(html).toContain("is-unavailable");
  });

  test("refresh on exhaustion requests fresh server data instead of same cached sources", () => {
    const tv = readFileSync(new URL("../src/components/tv/TvView.tsx", import.meta.url), "utf8");
    const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
    const model = readFileSync(new URL("../src/lib/canais.ts", import.meta.url), "utf8");
    const player = readFileSync(new URL("../src/components/player/LivePlayer.tsx", import.meta.url), "utf8");
    expect(tv).toContain('"/api/canais?refresh=1"');
    expect(tv).toContain("onSourcesExhausted={onSourcesExhausted}");
    expect(server).toContain('url.searchParams.get("refresh") === "1"');
    expect(server).toContain("loadCanais(forced)");
    expect(model).toContain("forcedCatalogRefreshAt");
    expect(model).toContain("FORCE_CATALOG_COOLDOWN_MS");
    expect(player).toContain("onSourcesExhausted?.()");
  });

  test("does not mark frozen first frame as successfully playing", () => {
    const player = readFileSync(new URL("../src/components/player/LivePlayer.tsx", import.meta.url), "utf8");
    const onPlaying = player.slice(player.indexOf("    const onPlaying ="), player.indexOf("    const onTimeUpdate ="));
    expect(onPlaying).not.toContain('onPlaybackStatus?.(canal.id, "playing")');
    expect(player).toContain("Math.abs(video.currentTime - progressReference) >= 1");
  });
});
