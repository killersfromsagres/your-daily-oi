// tests/genre-matching.test.ts — regression for series/anime genre navigation.
import { describe, expect, test } from "bun:test";
import { matchesGenre, normalizeGenre } from "../src/lib/genre-matching";

describe("genre navigation", () => {
  test("normalizes URL slugs and accents", () => {
    expect(normalizeGenre("ficcao-cientifica")).toBe("ficcao cientifica");
    expect(matchesGenre("acao", "Ação")).toBe(true);
  });
  test("matches translated TV genres", () => {
    expect(matchesGenre("ficcao-cientifica", "Sci-Fi & Fantasy")).toBe(true);
    expect(matchesGenre("suspense", "Thriller")).toBe(true);
    expect(matchesGenre("documentario", "Documentary")).toBe(true);
  });
  test("does not match missing or unrelated genres", () => {
    expect(matchesGenre("acao", "")).toBe(false);
    expect(matchesGenre("drama", "Comedy")).toBe(false);
    expect(matchesGenre("aventura", "Romance")).toBe(false);
  });
});
