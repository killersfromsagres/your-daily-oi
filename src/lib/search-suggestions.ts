// src/lib/search-suggestions.ts — shared server-side catalog ranking for real-time search.
import type { CatalogItem } from "./types";

export type SearchSuggestion = {
  id: string;
  title: string;
  type: CatalogItem["type"];
  posterUrl: string;
  year: number | null;
};

export function normalizeSearchTerm(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function searchSuggestionPath(item: Pick<SearchSuggestion, "id" | "type">): string {
  const category = item.type === "f" ? "filme" : item.type === "a" ? "anime" : "serie";
  return `/${category}/${encodeURIComponent(item.id)}`;
}

export function rankSearchSuggestions(
  items: readonly CatalogItem[],
  query: string,
  limit = 8,
): SearchSuggestion[] {
  const term = normalizeSearchTerm(query).slice(0, 80);
  if (!term || limit <= 0) return [];
  const tokens = term.split(" ");
  const seen = new Set<string>();
  const ranked: Array<{ score: number; item: SearchSuggestion }> = [];

  for (const candidate of items) {
    if (!candidate?.id || !candidate?.title || candidate.alias) continue;
    const title = normalizeSearchTerm(candidate.title);
    if (!title) continue;
    const index = title.indexOf(term);
    if (index < 0 && !tokens.every(token => title.includes(token))) continue;
    const unique = candidate.type + ":" + (candidate.tmdbId || title);
    if (seen.has(unique)) continue;
    seen.add(unique);
    const exact = title === term;
    const prefix = title.startsWith(term);
    const word = title.includes(" " + term);
    const score = (exact ? 1000 : prefix ? 650 : word ? 410 : index >= 0 ? 260 : 100) -
      Math.max(0, title.length - term.length) * 0.35;
    ranked.push({
      score,
      item: {
        id: candidate.id,
        title: candidate.title,
        type: candidate.type,
        posterUrl: candidate.posterUrl || "",
        year: candidate.tmdb?.releaseYear ?? null,
      },
    });
  }
  return ranked.sort((a,b) => b.score - a.score || a.item.title.localeCompare(b.item.title,"pt-BR"))
    .slice(0, Math.min(Math.max(1,Math.floor(limit)), 12))
    .map(result => result.item);
}
