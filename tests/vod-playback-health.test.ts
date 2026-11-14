import { describe, expect, test } from "bun:test";
import { looksLikeTruncatedFeature } from "../src/lib/vod-playback-health";

describe("VOD feature-length integrity", () => {
  test("rejects a 5-minute trailer masquerading as a 90-minute movie", () => {
    expect(looksLikeTruncatedFeature("movie", 5 * 60, 90)).toBe(true);
  });

  test("keeps a complete feature and any short-form anime or series", () => {
    expect(looksLikeTruncatedFeature("movie", 88 * 60, 90)).toBe(false);
    expect(looksLikeTruncatedFeature("anime", 5 * 60, 95)).toBe(false);
    expect(looksLikeTruncatedFeature("series", 5 * 60, 95)).toBe(false);
  });

  test("does not assume corrupt playback without authoritative runtime metadata", () => {
    expect(looksLikeTruncatedFeature("movie", 300, undefined)).toBe(false);
    expect(looksLikeTruncatedFeature("movie", 300, 45)).toBe(false);
    expect(looksLikeTruncatedFeature("movie", Infinity, 90)).toBe(false);
  });
});
