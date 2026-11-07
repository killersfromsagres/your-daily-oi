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
  test("requests landscape on fullscreen, unlocks on exit and rotates portrait fallback", () => {
    expect(player).toContain("tryLockLandscape(getOrientation())");
    expect(player).toContain("unlockLandscape(getOrientation())");
    expect(player).toContain("is-landscape-fallback");
    expect(player).toContain("rotateLandscapeFallback");
    expect(css).toContain("rotate(90deg)");
    expect(css).toContain("width: 100dvh !important");
    expect(css).toContain("height: 100dvw !important");
  });
  test("desktop controls use smaller consistently aligned icons and source labels", () => {
    expect(css).toContain("@media (min-width: 741px) and (pointer: fine)");
    expect(css).toContain(".ztv-player-frame .ydo-live-ctrl-btn svg");
    expect(css).toContain("width: 16px;");
    expect(css).toContain("height: 32px;");
    expect(css).toContain("text-overflow: ellipsis");
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
