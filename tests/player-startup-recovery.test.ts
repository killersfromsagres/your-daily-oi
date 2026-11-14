// tests/player-startup-recovery.test.ts — Bun; automatic startup and failover without inert Play state.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { playbackFailureKind, shouldChangeServerOnStartup } from "../src/lib/playback-start";
import { nextVodSourceIndex } from "../src/lib/vod-source-quality";
import type { StreamSource } from "../src/lib/types";

function failure(name: string): Error {
  const e = new Error("Mock video.play() rejection");
  e.name = name;
  return e;
}
function source(url: string, audio: "dub"|"leg", quality: string): StreamSource {
  return {url, audio, quality, format:"mp4"};
}

describe("Video startup recovery", () => {
  test("blocked autoplay leaves a real user gesture possible", () => {
    expect(playbackFailureKind(failure("NotAllowedError"))).toBe("gesture");
    expect(playbackFailureKind(failure("SecurityError"))).toBe("gesture");
    expect(shouldChangeServerOnStartup(25_000,false,true,false)).toBe(false);
  });

  test("codec/format/network failure is not mislabelled an autoplay block", () => {
    expect(playbackFailureKind(failure("NotSupportedError"))).toBe("source");
    expect(playbackFailureKind(failure("NotReadableError"))).toBe("source");
    expect(playbackFailureKind(new Error("Media network failed"))).toBe("source");
    expect(playbackFailureKind(failure("AbortError"))).toBe("interrupted");
  });

  test("automatically attempts another server when first playback stalls", () => {
    expect(shouldChangeServerOnStartup(4_000,false,false,false)).toBe(false);
    expect(shouldChangeServerOnStartup(10_999,false,false,false,11_000)).toBe(false);
    expect(shouldChangeServerOnStartup(11_000,false,false,false,11_000)).toBe(true);
    expect(shouldChangeServerOnStartup(18_000,true,false,false)).toBe(false);
    expect(shouldChangeServerOnStartup(18_000,false,false,true)).toBe(false);
  });

  test("server failover stops after dubbed sources fail and never plays subtitles", () => {
    const links = [
      source("https://video.example/dub-hq-1.mp4","dub","1080p"),
      source("https://video.example/leg-uhd.mp4","leg","4K"),
      source("https://video.example/dub-hq-2.mp4","dub","720p"),
    ];
    expect(nextVodSourceIndex(links,0,new Set(),{preferredAudio:"dub"})).toBe(2);
    expect(nextVodSourceIndex(links,2,new Set([links[0]!.url]),{preferredAudio:"dub"})).toBe(-1);
    expect(nextVodSourceIndex(links,1,new Set([links[0]!.url,links[2]!.url]))).toBe(-1);
  });

  test("all three VOD routes use the common player with automatic startup monitor", () => {
    const player = readFileSync(new URL("../src/components/player/OwnPlayer.tsx",import.meta.url),"utf8");
    const engine = readFileSync(new URL("../src/components/player/usePlayerEngine.ts",import.meta.url),"utf8");
    expect(player).toContain("shouldChangeServerOnStartup(");
    expect(player).toContain("recoverUnstartedSource()");
    expect(player).toContain("engine.needsUserGesture");
    expect(engine).toContain('setState("error")');
    expect(engine).toContain('setNeedsUserGesture(true)');
    for (const route of [
      "assistir.filme.$id.tsx",
      "assistir.serie.$id.$temp.$ep.tsx",
      "assistir.anime.$id.$temp.$ep.tsx",
    ]) {
      const content = readFileSync(new URL("../src/routes/" + route,import.meta.url),"utf8");
      expect(content).toContain("<OwnPlayer");
    }
  });
});
