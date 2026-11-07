// src/lib/hero-rotation.ts — deterministic, bounded and cache-friendly hero rotation.
export const HERO_ROTATION_MS = 30 * 60 * 1000;

type HeroCandidate = { id: string; title: string; type: "f" | "s" | "a" };
type HeroHighlight = { items: { title: string; type: "f" | "s" | "a" }[] };

export function normalizeHeroTitle(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Rotate the movie selection every half hour, not on each request. This makes
 * repeated visits consistent within a window while introducing new highlights.
 * Only catalog titles are returned; the function never invents movie entries.
 */
export function selectRotatingHero<T extends HeroCandidate>(
  items: T[],
  highlights: HeroHighlight[],
  curatedQueries: string[],
  timestamp: number,
  limit = 8,
): T[] {
  const movies = items.filter(item => item.type === "f" && !item.title.startsWith("#"));
  const indexed = new Map<string, T>();
  for (const movie of movies) {
    const name = normalizeHeroTitle(movie.title);
    if (!indexed.has(name)) indexed.set(name, movie);
  }
  const choices: T[] = [];
  const seen = new Set<string>();
  const add = (item?: T) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    choices.push(item);
  };
  for (const query of curatedQueries) {
    const normalized = normalizeHeroTitle(query);
    if (!normalized) continue;
    add(movies.find(item => normalizeHeroTitle(item.title).includes(normalized)));
  }
  for (const row of highlights) {
    for (const highlight of row.items) {
      if (highlight.type !== "f") continue;
      add(indexed.get(normalizeHeroTitle(highlight.title)));
      if (choices.length >= 24) break;
    }
    if (choices.length >= 24) break;
  }
  // Prioritize curated and real featured movies over catalog's arbitrary order.
  // The fallback only applies when there are too few highlighted titles.
  if (choices.length < limit + 4) {
    for (const movie of movies) {
      if (movie.title.startsWith("#")) continue;
      add(movie);
      if (choices.length >= Math.max(limit + 4, 16)) break;
    }
  }
  if (!choices.length) return [];
  const count = Math.min(Math.max(1, Math.floor(limit)), choices.length);
  const window = Math.floor(Math.max(0, timestamp) / HERO_ROTATION_MS);
  const offset = ((window * 3) % choices.length + choices.length) % choices.length;
  return Array.from({ length: count }, (_, index) => choices[(offset + index) % choices.length]!);
}
