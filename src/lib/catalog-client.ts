// src/lib/catalog-client.ts — one parsed catalog per browser session, with request de-duplication.
import type { CatalogItem, HighlightRow } from "./types";

export interface CatalogClientData {
  items: CatalogItem[];
  highlights: HighlightRow[];
  genres: string[];
  featuredHero?: CatalogItem[];
  friday13Hero?: CatalogItem[];
  sourceStatus?: { state: "remote" | "fallback" | "uninitialized"; checkedAt: string | null };
}

export const CATALOG_PAGE_SIZE = 36;
const CATALOG_CACHE_MS = 4 * 60_000;

let lastValue: CatalogClientData | null = null;
let lastLoadedAt = 0;
let inFlight: Promise<CatalogClientData> | null = null;

export function catalogVisibleItems<T>(items: T[], count: number): T[] {
  return items.slice(0, Math.max(0, Math.floor(count)));
}
export function nextCatalogPage(count: number, total: number): number {
  return Math.min(total, Math.max(0, count) + CATALOG_PAGE_SIZE);
}

/** Prevent parallel page transitions from fetching and parsing the full VOD JSON again. */
export function getClientCatalog(): Promise<CatalogClientData> {
  const now = Date.now();
  if (lastValue && now - lastLoadedAt < CATALOG_CACHE_MS) {
    return Promise.resolve(lastValue);
  }
  if (inFlight) return inFlight;
  inFlight = fetch("/api/catalogo", { cache: "no-store" })
    .then(async res => {
      if (!res.ok) throw new Error("Falha ao buscar catálogo: HTTP " + res.status);
      const body: unknown = await res.json();
      if (!body || typeof body !== "object" || !("items" in body) ||
        !Array.isArray(body.items)) throw new Error("Catálogo inválido");
      const parsed = body as CatalogClientData;
      lastValue = {
        ...parsed,
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        genres: Array.isArray(parsed.genres) ? parsed.genres : [],
      };
      lastLoadedAt = Date.now();
      return lastValue;
    })
    .catch(error => {
      // Preserve the previously loaded selection if a brief network outage occurs.
      if (lastValue) return lastValue;
      throw error;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}
