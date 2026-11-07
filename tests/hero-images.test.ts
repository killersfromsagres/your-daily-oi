// tests/hero-images.test.ts — verify reduced mobile hero assets.
import { describe, expect, test } from "bun:test";
import { getSizedHeroImage } from "../src/lib/hero-images";

describe("hero image memory budget", () => {
  const tmdb = "https://image.tmdb.org/t/p/original/posterABC.jpg";
  test("selects mobile and desktop CDN sizes instead of original", () => {
    expect(getSizedHeroImage(tmdb, null, "w780")).toBe("https://image.tmdb.org/t/p/w780/posterABC.jpg");
    expect(getSizedHeroImage(tmdb, null, "w1280")).toBe("https://image.tmdb.org/t/p/w1280/posterABC.jpg");
  });
  test("reuses smaller renditions without upscaling to original", () => {
    expect(getSizedHeroImage("https://image.tmdb.org/t/p/w342/s.jpg", null, "w780"))
      .toBe("https://image.tmdb.org/t/p/w780/s.jpg");
  });
  test("can select original on large TV displays", () => {
    expect(getSizedHeroImage("https://image.tmdb.org/t/p/w780/bg.jpg", null, "original"))
      .toBe("https://image.tmdb.org/t/p/original/bg.jpg");
  });
  test("preserves unrelated hosts and handles missing images", () => {
    expect(getSizedHeroImage("https://media.example.com/poster.jpg", null, "w780"))
      .toBe("https://media.example.com/poster.jpg");
    expect(getSizedHeroImage(null, null, "w780")).toBe("");
    expect(getSizedHeroImage(null, tmdb, "w780")).toContain("/w780/");
  });
});
