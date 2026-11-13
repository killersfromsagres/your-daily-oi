// tests/hq-playback-policy.test.ts — regression: GPU failure must not disable HQ.
import { describe, expect, test } from "bun:test";
import { selectHqBackend, type HqPlaybackState } from "../src/lib/hq-playback-policy";
import { readFileSync } from "node:fs";

const base: HqPlaybackState = {
  requested: true,
  neuralActive: false,
  neuralUnavailable: false,
  webglActive: false,
  webglSupported: true,
  webglFailed: false,
};
describe("HQ renderer failover", () => {
  test("always displays HQ while the renderer is preparing", () => {
    expect(selectHqBackend(base)).toBe("waiting");
  });
  test("prefers neural reconstruction when successful", () => {
    expect(selectHqBackend({ ...base, neuralActive: true })).toBe("neural");
  });
  test("falls back to GPU shader without changing HQ setting", () => {
    expect(selectHqBackend({ ...base, neuralUnavailable: true, webglActive: true })).toBe("webgl");
  });
  test("switches to native color tuning if both GPU renderers fail", () => {
    expect(selectHqBackend({ ...base, neuralUnavailable: true, webglFailed: true })).toBe("native");
    expect(selectHqBackend({ ...base, neuralUnavailable: true, webglSupported: false })).toBe("native");
  });
  test("does not apply HQ visuals when user explicitly toggles it off", () => {
    expect(selectHqBackend({ ...base, requested: false, webglActive: true })).toBe("off");
  });
  test("the player does not silently clear HQ preference on GPU failures", () => {
    const src = readFileSync("src/components/player/OwnPlayer.tsx", "utf8");
    const fallback = src.slice(src.indexOf("const handleHqDowngrade"), src.indexOf("const neural = useNeuralVideoUpscaler"));
    expect(fallback).toContain("setWebglFailed(true)");
    expect(fallback).not.toContain("setHqEnabled(false)");
    expect(src).toContain('filter: nativeHqFallback ?');
  });
  test("the button has a stable HQ label even when the backend changes", () => {
    const controls = readFileSync("src/components/player/PlayerControls.tsx", "utf8");
    expect(controls).toContain("<span>HQ</span>");
    expect(controls).not.toContain("<span>IA 2×</span>");
  });
});
