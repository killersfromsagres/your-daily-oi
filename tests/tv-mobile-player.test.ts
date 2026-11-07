// tests/tv-mobile-player.test.ts — layout and fullscreen regression tests.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const source = (name: string) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
const player = source("components/player/LivePlayer.tsx");
const tv = source("components/tv/TvView.tsx");
const cast = source("components/player/CastControl.tsx");
const css = source("styles/tv-mobile-player.css");

describe("Zang Live mobile-first player", () => {
  test("fullscreen lives in the same minimal toolbar on desktop and mobile", () => {
    expect(player).toContain('role="toolbar" aria-label="Controles da TV ao vivo"');
    expect(player).toContain('aria-label={isFullscreen ? "Sair da tela cheia" : "Assistir em tela cheia"}');
    expect(player).not.toContain('className="ydo-live-mobile-fullscreen"');
    expect(source("styles/live-controls-minimal.css")).toContain(".zf-player-toolbar");
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
  test("only icon controls remain in the toolbar; volume, latency and PiP live in settings", () => {
    const minimalCss = source("styles/live-controls-minimal.css");
    expect(player).toContain('className="zf-player-volume-control"');
    expect(player).toContain('className="zf-player-menu-option"');
    expect(player).toContain('role="dialog" aria-label="Qualidade e ajustes de reprodução"');
    expect(player).not.toContain('className="ydo-live-controls-bar"');
    expect(minimalCss).toContain(".zf-player-menu-option");
    expect(minimalCss).toContain("--zf-toolbar-icon: 30px");
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
  test("minimal controls isolate the toolbar from old desktop and mobile CSS rules", () => {
    const minimalCss = source("styles/live-controls-minimal.css");
    expect(minimalCss).toContain(".ydo-live-player-container .zf-player-tools-start");
    expect(minimalCss).toContain(".ydo-live-player-container .zf-player-tools-end");
    expect(minimalCss).toContain("flex: 0 0 var(--zf-toolbar-icon)");
    expect(minimalCss).toContain("width: 16px;");
    expect(minimalCss).toContain("text-overflow: ellipsis");
    expect(cast).toContain('className={"zf-player-action zang-cast-trigger"');
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
