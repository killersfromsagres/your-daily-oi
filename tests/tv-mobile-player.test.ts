// tests/tv-mobile-player.test.ts — layout and fullscreen regression tests.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const source = (name: string) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
const player = source("components/player/LivePlayer.tsx");
const tv = source("components/tv/TvView.tsx");
const cast = source("components/player/CastControl.tsx");
const css = source("styles/tv-mobile-player.css");

describe("Zang Live mobile-first player", () => {
  test("has a dedicated always-reachable fullscreen action", () => {
    expect(player).toContain('className="ydo-live-mobile-fullscreen"');
    expect(player).toContain('aria-label={isFullscreen ? "Sair da tela cheia" : "Assistir em tela cheia"}');
    expect(css).toContain(".ydo-live-mobile-fullscreen {");
  });
  test("uses native browser fullscreen and iPhone fullscreen before theater fallback", () => {
    expect(player).toContain("video.webkitEnterFullscreen()");
    expect(player).toContain("el.requestFullscreen()");
    expect(player).toContain('setTheaterFullscreen(true)');
    expect(player).toContain('document.addEventListener("fullscreenchange"');
    expect(player).toContain('video?.addEventListener("webkitbeginfullscreen"');
    expect(css).toContain(".ydo-live-player-container.is-theater");
    expect(css).toContain("height: 100dvh !important");
  });
  test("mobile player does not cram desktop volume, latency and PiP controls into video", () => {
    expect(css).toContain(".ydo-live-volume-slider,");
    expect(css).toContain(".ydo-live-latency-btn {");
    expect(css).toContain('.ydo-live-ctrl-btn[aria-label="Picture-in-Picture"]');
    expect(css).toContain(".ydo-live-options-latency");
    expect(css).toContain(".ydo-live-options-pip");
    expect(player).toContain("Transmissão e qualidade");
  });
  test("keeps mobile cast dialog above the player and retains a responsive compact hero", () => {
    expect(cast).toContain('createPortal(');
    expect(cast).toContain("zang-cast-mobile-overlay");
    expect(css).toContain(".zang-cast-mobile-overlay");
    expect(tv).toContain('import "@/styles/tv-mobile-player.css"');
    expect(tv).toContain("ztv-title-mobile");
    expect(tv).toContain("ztv-btn-label-mobile");
  });
});
