import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { loadCatalog, getGenres, searchItems } from "./lib/catalog";
import { getTmdbData } from "./lib/tmdb";
import type { CatalogItem } from "./lib/types";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function jsonResponse(payload: unknown, status = 200, cacheControl = "public, max-age=1800, stale-while-revalidate=86400"): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "access-control-allow-origin": "*",
    },
  });
}

/**
 * Route Handler /api/catalogo com enriquecimento TMDB para os destaques
 */
async function handleCatalogoApi(url: URL): Promise<Response> {
  try {
    const q = url.searchParams.get("q");
    const { items, highlights } = await loadCatalog();

    if (q) {
      const results = searchItems(items, q).slice(0, 50);
      return jsonResponse({ items: results });
    }

    // Identificar os títulos dos destaques para enriquecer o banner HD
    const heroTitleSet = new Set<string>();
    for (const hl of highlights.slice(0, 2)) {
      for (const it of hl.items.slice(0, 5)) {
        heroTitleSet.add(it.title.toLowerCase());
      }
    }

    const allItems = Array.from(items.values());

    // Hidratar os primeiros 6 itens do destaque com TMDB em paralelo
    const heroItemsEnriched = await Promise.all(
      allItems
        .filter((i) => heroTitleSet.has(i.title.toLowerCase()))
        .slice(0, 6)
        .map(async (item) => {
          if (item.tmdbId && !item.tmdb) {
            try {
              const tmdb = await getTmdbData(item.tmdbId, item.type);
              return { ...item, tmdb };
            } catch {
              return item;
            }
          }
          return item;
        })
    );

    // Mesclar os enriquecidos de volta na lista
    const enrichedMap = new Map(heroItemsEnriched.map((i) => [i.id, i]));
    const finalItems = allItems.map((item) => enrichedMap.get(item.id) || item);

    return jsonResponse({
      items: finalItems,
      highlights,
      genres: getGenres(items),
    });
  } catch (error) {
    console.error("Erro na API /api/catalogo:", error);
    return jsonResponse(
      { error: "Falha ao carregar acervo do Saimo TV", details: String(error) },
      502
    );
  }
}

/**
 * Route Handler /api/item?id=X para obter detalhes e metadados TMDB
 */
async function handleItemApi(url: URL): Promise<Response> {
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "ID ausente" }, 400);

  const { items } = await loadCatalog();
  const item = items.get(id) || Array.from(items.values()).find((i) => i.id === id);
  if (!item) return jsonResponse({ error: "Item não encontrado" }, 404);

  if (item.tmdbId && !item.tmdb) {
    try {
      const tmdb = await getTmdbData(item.tmdbId, item.type);
      return jsonResponse({ ...item, tmdb } as CatalogItem);
    } catch {
      return jsonResponse(item);
    }
  }

  return jsonResponse(item);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/api/catalogo") {
        return await handleCatalogoApi(url);
      }
      if (url.pathname === "/api/item") {
        return await handleItemApi(url);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
