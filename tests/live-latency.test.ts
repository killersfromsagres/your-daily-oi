// tests/live-latency.test.ts — bun tests, pure latency policy.
import { describe, expect, test } from "bun:test";
import { decideLiveCatchup, hlsLatencyOptions, mpegtsLatencyOptions } from "../src/lib/live-latency";

describe("Live latency edge policy", () => {
  test("fast mode targets fewer segments while keeping a safety buffer", () => {
    const fast = hlsLatencyOptions("fast");
    const stable = hlsLatencyOptions("stable");
    expect(fast.liveSyncDurationCount).toBeLessThan(stable.liveSyncDurationCount);
    expect(fast.liveMaxLatencyDurationCount).toBeGreaterThan(fast.liveSyncDurationCount);
    expect(mpegtsLatencyOptions("fast").enableStashBuffer).toBe(false);
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
    expect(decideLiveCatchup(input)).toMatchObject({action:"speed",rate:1.06});
    expect(decideLiveCatchup({...input,hlsManaged:true}).action).toBe("none");
  });
});
