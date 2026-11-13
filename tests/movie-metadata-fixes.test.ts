import { describe, expect, test } from "bun:test";
import { correctClassicStreetFighter, isClassicStreetFighter } from "../src/lib/movie-metadata-fixes";
import type { CatalogItem } from "../src/lib/types";

const make = (title: string, type: CatalogItem["type"] = "f"): CatalogItem => ({
  id: "street-fighter",
  type,
  title,
  tmdbId: 999999,
  posterPath: "/incorrect-2026.jpg",
  posterUrl: "https://image.tmdb.org/t/p/w500/incorrect-2026.jpg",
  genres: ["Ação"],
  streams: [{ url: "https://example.com/legacy.mp4", audio: "dub" }],
  tmdb: null,
});

describe("Street Fighter movie identity", () => {
  test("corrects the old catalogue item without changing playback routes or source", () => {
    const original = make("Street Fighter");
    const fixed = correctClassicStreetFighter(original);
    expect(fixed.id).toBe(original.id);
    expect(fixed.streams).toBe(original.streams);
    expect(fixed.tmdbId).toBe(11667);
    expect(fixed.tmdb?.releaseYear).toBe(1994);
    expect(fixed.posterUrl).toBe("");
  });
  test("respects a separately identified 2026 reboot", () => {
    const newer = make("Street Fighter (2026)");
    expect(isClassicStreetFighter(newer.title, newer.type)).toBe(false);
    expect(correctClassicStreetFighter(newer)).toBe(newer);
  });
  test("does not alter animated movies, television or unrelated titles", () => {
    for (const title of ["Street Fighter II: The Animated Movie", "Street Fighter: The Legend of Chun-Li"]) {
      const original = make(title);
      expect(correctClassicStreetFighter(original)).toBe(original);
    }
    expect(correctClassicStreetFighter(make("Street Fighter", "s")).tmdbId).toBe(999999);
    expect(isClassicStreetFighter("Street Fighter - A Batalha Final", "f")).toBe(true);
  });
});
