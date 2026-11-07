// tests/hero-rotation.test.ts — cached banner selection and refresh cadence.
import { describe, expect, test } from "bun:test";
import { HERO_ROTATION_MS, selectRotatingHero } from "../src/lib/hero-rotation";

const items = Array.from({ length: 18 }, (_, n) => ({
  id: String(n + 1), title: "Filme " + (n + 1), type: "f" as const,
}));
const highlights = [{ items: items.map(x => ({ title:x.title, type:x.type })) }];

describe("automatic featured movie rotation", () => {
  test("selects genuine catalog movies without duplicates", () => {
    const result = selectRotatingHero([...items, { id:"a", title:"Anime", type:"a" as const }],
      highlights, ["Filme 1", "Filme 2"], 0);
    expect(result.length).toBe(8);
    expect(new Set(result.map(x => x.id)).size).toBe(8);
    expect(result.every(x => x.type === "f")).toBe(true);
  });
  test("maintains a stable selection within a 30 minute window", () => {
    const first = selectRotatingHero(items, highlights, [], 1000).map(x => x.id);
    const next = selectRotatingHero(items, highlights, [], HERO_ROTATION_MS - 1).map(x => x.id);
    expect(first).toEqual(next);
  });
  test("updates selected movies when the next window begins", () => {
    const first = selectRotatingHero(items, highlights, [], 0).map(x => x.id);
    const next = selectRotatingHero(items, highlights, [], HERO_ROTATION_MS).map(x => x.id);
    expect(first).not.toEqual(next);
  });
  test("handles small catalog and aliases without fabricating media", () => {
    const limited = selectRotatingHero([items[0]!,items[1]!], [], [], 0);
    expect(limited.map(x=>x.id)).toEqual(["1","2"]);
    expect(selectRotatingHero([], [], [], 0)).toEqual([]);
  });
});
