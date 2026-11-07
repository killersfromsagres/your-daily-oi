// tests/live-playback-watchdog.test.ts — stalled player recovery without false positives.
import { describe, expect, test } from "bun:test";
import { classifyLivePlaybackStall } from "../src/lib/live-latency";

const base = { elapsedWithoutProgressMs: 0, currentTime: 0, readyState: 4,
  paused:false,ended:false,seeking:false };

describe("live channel stalled playback",()=>{
 test("detects stream at 00:00 even with readyState HAVE_ENOUGH_DATA",()=>{
  expect(classifyLivePlaybackStall({...base,elapsedWithoutProgressMs:14_000})).toBeNull();
  expect(classifyLivePlaybackStall({...base,elapsedWithoutProgressMs:15_000})).toBe("startup");
 });
 test("does not disrupt paused, seeking or ended video",()=>{
  for(const mode of ["paused","ended","seeking"] as const){
   expect(classifyLivePlaybackStall({...base,[mode]:true,elapsedWithoutProgressMs:70_000})).toBeNull();
  }
 });
 test("recovers a buffering stream and also a silent freeze with readyState 4",()=>{
  expect(classifyLivePlaybackStall({...base,currentTime:180,readyState:2,elapsedWithoutProgressMs:24_000})).toBeNull();
  expect(classifyLivePlaybackStall({...base,currentTime:180,readyState:2,elapsedWithoutProgressMs:25_000})).toBe("buffer");
  expect(classifyLivePlaybackStall({...base,currentTime:180,readyState:4,elapsedWithoutProgressMs:35_000})).toBe("frozen");
 });
 test("ignores normal brief buffering and invalid elapsed time",()=>{
  expect(classifyLivePlaybackStall({...base,currentTime:180,elapsedWithoutProgressMs:8_000})).toBeNull();
  expect(classifyLivePlaybackStall({...base,elapsedWithoutProgressMs:NaN})).toBeNull();
 });
});
