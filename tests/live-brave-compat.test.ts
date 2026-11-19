import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { browserLiveTransport, isBraveBrowser, needsPlaybackGesture } from "../src/lib/live-browser-compat";

const source = { url: "https://licensed.example/live/channel.m3u8" };
const sourceWithProxyPreference = { url: "http://licensed.example/live/channel.m3u8" };

describe("Brave media compatibility without weakening Shields", () => {
  test("checks official Brave API instead of indistinguishable Chromium user-agent", async () => {
    const brave = { brave: { isBrave: async () => true }, userAgent: "Mozilla/5.0 Chrome" } as unknown as Navigator;
    const edge = { userAgent: "Mozilla/5.0 Chrome" } as unknown as Navigator;
    expect(await isBraveBrowser(brave)).toBe(true);
    expect(await isBraveBrowser(edge)).toBe(false);
    expect(await isBraveBrowser()).toBe(false);
    expect(await isBraveBrowser({ brave: { isBrave: async () => { throw new Error("blocked"); } } } as unknown as Navigator)).toBe(false);
  });

  test("uses first-party proxy when the backend supports the route", () => {
    expect(browserLiveTransport(source, true, "catalog")).toBe("proxy");
    expect(browserLiveTransport(source, true, "legacy")).toBe("proxy");
    expect(browserLiveTransport(source, true, "checking")).toBe("proxy");
    expect(browserLiveTransport(source, false, "catalog")).toBe("direct");
    expect(browserLiveTransport(source, true, "unavailable")).toBe("direct");
    expect(browserLiveTransport(source, false, "catalog", true)).toBe("proxy");
    expect(browserLiveTransport(sourceWithProxyPreference, false, "catalog")).toBe("proxy");
  });

  test("autoplay policy is separate from a network failure", () => {
    expect(needsPlaybackGesture({ name: "NotAllowedError" })).toBe(true);
    expect(needsPlaybackGesture({ message: "play() failed because user didn't interact with the document" })).toBe(true);
    expect(needsPlaybackGesture({ message: "Autoplay was blocked due to user gesture required" })).toBe(true);
    expect(needsPlaybackGesture({ name: "NetworkError", message: "HLS connection failed" })).toBe(false);
    expect(needsPlaybackGesture({ name: "NotSupportedError", message: "Media format is not supported" })).toBe(false);
    expect(needsPlaybackGesture(null)).toBe(false);
  });
});

describe("Brave player user experience", () => {
  const player = readFileSync("src/components/player/LivePlayer.tsx", "utf8");
  const style = readFileSync("src/styles/live-browser-compat.css", "utf8");
  test("loads bundled HLS/MPEGTS and adapts a nonplaying Brave session", () => {
    expect(player).toContain('await import("hls.js")');
    expect(player).toContain('await import("mpegts.js")');
    expect(player).toContain("isBraveBrowser(navigator)");
    expect(player).toContain("braveFirstPartyRef.current = true");
    expect(player).toContain("browserLiveTransport(f, firstParty, backend");
    expect(player).toContain('proxyBackend !== "unavailable"');
    expect(player).toContain("!everPlayedRef.current");
    expect(player).toContain("handleFatalError");
    expect(player).toContain("nextLiveMode(rawFonte, attemptMode, attempted)");
    expect(player).not.toContain('navigator.userAgent.includes("Brave")');
  });

  test("preserves HLS engine when autoplay requires a click, with accessible trigger", () => {
    expect(player).toContain("requireGesture(reason)");
    expect(player).toContain("clearTimeout(timeout);");
    expect(player).toContain("setGestureRequired(true)");
    expect(player).toContain("const action = video.play();");
    expect(player).toContain("Reproduzir canal ao vivo");
    expect(player).toContain("Iniciar transmissão");
    expect(style).toContain(".zf-live-gesture-overlay");
    expect(style).toContain("prefers-reduced-motion");
    expect(style).not.toContain("ydo-live-video {filter:");
  });
});
