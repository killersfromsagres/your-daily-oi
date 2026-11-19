// tests/live-latency.test.ts — bun tests, pure latency policy.
import { describe, expect, test } from "bun:test";
import { decideLiveCatchup, hlsLatencyOptions, mpegtsLatencyOptions, preferredLiveLatencyMode } from "../src/lib/live-latency";

describe("Live latency edge policy", () => {
  test("fast mode targets fewer segments while keeping a safety buffer", () => {
    const fast = hlsLatencyOptions("fast");
    const stable = hlsLatencyOptions("stable");
    expect(fast.liveSyncDurationCount).toBeLessThan(stable.liveSyncDurationCount);
    expect(fast.liveMaxLatencyDurationCount).toBeGreaterThan(fast.liveSyncDurationCount);
    expect(mpegtsLatencyOptions("fast").enableStashBuffer).toBe(false);
    expect(stable.maxLiveSyncPlaybackRate).toBe(1);
    expect(stable.lowLatencyMode).toBe(false);
    expect(stable.maxBufferLength).toBeGreaterThan(fast.maxBufferLength);
    expect(stable.backBufferLength).toBeLessThanOrEqual(28);
  });
  test("sports and Premiere start with smoother buffering unless the viewer explicitly selected fast", () => {
    expect(preferredLiveLatencyMode("Esportes", "Premiere 3")).toBe("stable");
    expect(preferredLiveLatencyMode("TV", "SporTV 2")).toBe("stable");
    expect(preferredLiveLatencyMode("Esportes", "Premiere 3", "fast")).toBe("fast");
    expect(preferredLiveLatencyMode("Esportes", "Premiere 3", "stable")).toBe("stable");
    expect(preferredLiveLatencyMode("Variedades", "TV Cultura")).toBe("fast");
  });
  test("smooth mode avoids repeated catch-up seeks and unnatural speed changes", () => {
    const input = { edge:100,current:80,syncPosition:94,bufferAhead:1,
      stalled:false,paused:false,mode:"stable" as const,hlsManaged:true };
    expect(decideLiveCatchup(input).action).toBe("none");
    expect(decideLiveCatchup({...input,bufferAhead:4.5, current:60}).action).toBe("seek");
    expect(decideLiveCatchup({...input,hlsManaged:false,bufferAhead:3}).action).toBe("none");
  });
  test("does not seek on a small drift, stalled stream or paused media", () => {
    const input = { edge:100, current:96, syncPosition:97, bufferAhead:2, stalled:false, paused:false, mode:"fast" as const,hlsManaged:true };
    expect(decideLiveCatchup(input).action).toBe("none");
    expect(decideLiveCatchup({...input,current:67,stalled:true}).action).toBe("none");
    expect(decideLiveCatchup({...input,current:67,paused:true}).action).toBe("none");
  });
  test("seeks only for material drift and with a forward buffer", () => {
    const input = { edge:100,current:70,syncPosition:95,bufferAhead:3,stalled:false,paused:false,mode:"fast" as const,hlsManaged:true };
    expect(decideLiveCatchup(input)).toMatchObject({action:"seek",position:95});
    expect(decideLiveCatchup({...input,bufferAhead:0.1}).action).toBe("none");
  });
  test("adjusts native video speed while keeping HLS speed under its own controller", () => {
    const input = { edge:100,current:90,syncPosition:97,bufferAhead:3,stalled:false,paused:false,mode:"fast" as const,hlsManaged:false };
    expect(decideLiveCatchup(input)).toMatchObject({action:"speed",rate:1.03});
    expect(decideLiveCatchup({...input,hlsManaged:true}).action).toBe("none");
    expect(decideLiveCatchup({...input,mode:"stable"}).action).toBe("none");
  });
});
