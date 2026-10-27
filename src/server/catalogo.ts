import { createServerFn } from "@tanstack/react-start";
import { loadCatalog, getGenres, searchItems } from "@/lib/catalog";
import { getTmdbData } from "@/lib/tmdb";
import type { CatalogItem } from "@/lib/types";

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { items, highlights } = await loadCatalog();
  return {
    items: Array.from(items.values()),
    highlights,
    genres: getGenres(items),
  };
});

export const searchCatalog = createServerFn({ method: "GET" })
  .validator((query: string) => query)
  .handler(async ({ data: query }) => {
    const { items } = await loadCatalog();
    return searchItems(items, query).slice(0, 50);
  });

export const getItem = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { items } = await loadCatalog();
    const item = items.get(id) ?? Array.from(items.values()).find((i) => i.id === id);
    if (!item) return null;

    // Hidrata com TMDB se possuir tmdbId e ainda não tiver dados
    if (item.tmdbId && !item.tmdb) {
      const tmdb = await getTmdbData(item.tmdbId, item.type);
      return { ...item, tmdb } as CatalogItem;
    }
    return item;
  });

export const getHighlightsWithBackdrop = createServerFn({ method: "GET" }).handler(async () => {
  const { items, highlights } = await loadCatalog();
  
  // Coletar os títulos dos destaques iniciais (Em alta, etc)
  const candidateTitles: string[] = [];
  for (const hl of highlights.slice(0, 3)) {
    for (const it of hl.items.slice(0, 6)) {
      candidateTitles.push(it.title.toLowerCase());
    }
  }

  const candidateItems = Array.from(items.values()).filter((item) =>
    candidateTitles.includes(item.title.toLowerCase())
  );

  // Hidratar até 6 títulos com TMDB para o carrossel do banner
  const enriched = await Promise.all(
    candidateItems.slice(0, 6).map(async (item) => {
      if (item.tmdbId) {
        const tmdb = await getTmdbData(item.tmdbId, item.type);
        return { ...item, tmdb };
      }
      return item;
    })
  );

  return enriched;
});
