import { createServerFn } from "@tanstack/react-start";
import { loadCatalog, getGenres, searchItems } from "@/lib/catalog";

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
    return items.get(id) ?? null;
  });
