import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { loadCatalog, getGenres, searchItems, getStreamsForItem, getSeasonsForSeries, cleanDisplayTitle, normalizeTitle } from "./lib/catalog";
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

function jsonResponse(payload: unknown, status = 200, cacheControl = "no-cache, no-store, must-revalidate"): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "pragma": "no-cache",
      "expires": "0",
      "access-control-allow-origin": "*",
    },
  });
}

// Cache em memória de itens hidratados para resposta instantânea (< 10ms)
const itemDetailsCache = new Map<string, { data: CatalogItem; expires: number }>();

// Backdrops oficiais em 4K/Full HD widescreen para os filmes mais assistidos
const POPULAR_HD_BACKDROPS: Record<string, string> = {
  "duna": "https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s520QIq.jpg",
  "deadpool": "https://image.tmdb.org/t/p/original/yDHYTfaA95btDX4Ifcn3po72HGm.jpg",
  "homem aranha": "https://image.tmdb.org/t/p/original/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg",
  "vingadores": "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
  "oppenheimer": "https://image.tmdb.org/t/p/original/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg",
  "interestelar": "https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
  "batman": "https://image.tmdb.org/t/p/original/5P8SmMzSNYikXpxil6BYzJ16611.jpg",
  "avatar": "https://image.tmdb.org/t/p/original/17Z142hN1PpsvQ1QxLp8J1L893T.jpg",
  "top gun": "https://image.tmdb.org/t/p/original/AaV1YIdWKnjAIAOe8UUKBFm327v.jpg",
  "harry potter": "https://image.tmdb.org/t/p/original/n5A7br2mzVncUVmUmMFTqG97KG2.jpg",
  "moana": "https://image.tmdb.org/t/p/original/tE18vFpGqMhyv7Z5kF9fW7R783x.jpg",
  "ponto sem retorno": "https://image.tmdb.org/t/p/original/1C2qbfUW3lTzb8vpZeG8pjYzW3Q.jpg"
};

// Lista curada de franquias e blockbusters mais assistidos no mundo
const TOP_BLOCKBUSTERS = [
  "duna",
  "deadpool",
  "homem aranha",
  "vingadores",
  "oppenheimer",
  "interestelar",
  "batman",
  "avatar",
  "top gun",
  "harry potter",
  "moana",
  "ponto sem retorno"
];

/**
 * Route Handler /api/catalogo enriquecido com backdrops em alta resolução para os destaques
 */
async function handleCatalogoApi(url: URL): Promise<Response> {
  try {
    const q = url.searchParams.get("q");
    const { items, highlights } = await loadCatalog();

    if (q) {
      const results = searchItems(items, q).slice(0, 50);
      return jsonResponse({ items: results });
    }

    const allItems = Array.from(items.values());

    // Seleciona exclusivamente os filmes mais assistidos e populares do catálogo para o carrossel do banner
    const selectedMostWatched: CatalogItem[] = [];
    const usedIds = new Set<string>();

    // 1. Procura pelos blockbusters mais assistidos conhecidos
    for (const query of TOP_BLOCKBUSTERS) {
      const found = allItems.find((it) => {
        if (usedIds.has(it.id)) return false;
        // Nunca incluir itens com # no banner de destaque
        if (it.title.startsWith("#")) return false;
        const norm = normalizeTitle(it.title);
        return norm.includes(query);
      });
      if (found) {
        selectedMostWatched.push(found);
        usedIds.add(found.id);
      }
      if (selectedMostWatched.length >= 8) break;
    }

    // 2. Se faltar, completa com os primeiros itens de destaques.txt (excluindo qualquer item com #)
    if (selectedMostWatched.length < 8 && highlights.length > 0) {
      for (const hl of highlights) {
        for (const item of hl.items) {
          if (item.title.startsWith("#")) continue;
          const found = allItems.find((it) => !usedIds.has(it.id) && normalizeTitle(it.title) === normalizeTitle(item.title));
          if (found) {
            selectedMostWatched.push(found);
            usedIds.add(found.id);
          }
          if (selectedMostWatched.length >= 8) break;
        }
        if (selectedMostWatched.length >= 8) break;
      }
    }

    // Hidrata em paralelo os itens do carrossel com metadados do TMDB (backdrop 4K / original)
    const enrichedHeroItems = await Promise.all(
      selectedMostWatched.map(async (item) => {
        const cached = itemDetailsCache.get(item.id);
        if (cached && cached.data.tmdb?.backdropUrl) {
          return cached.data;
        }

        let tmdbData = item.tmdb;
        if (item.tmdbId) {
          try {
            const tmdb = await getTmdbData(item.tmdbId, item.type);
            if (tmdb) tmdbData = tmdb;
          } catch {
            // continua
          }
        }

        // Garante que o backdropUrl seja 4K / original
        let backdropUrl = tmdbData?.backdropUrl || null;
        if (!backdropUrl) {
          const norm = normalizeTitle(item.title);
          for (const [key, fallbackUrl] of Object.entries(POPULAR_HD_BACKDROPS)) {
            if (norm.includes(key)) {
              backdropUrl = fallbackUrl;
              break;
            }
          }
        }

        const enriched: CatalogItem = {
          ...item,
          tmdb: tmdbData
            ? { ...tmdbData, backdropUrl }
            : {
                overview: "Assista a este grande sucesso em alta definição no catálogo Zang Flix.",
                voteAverage: 8.5,
                backdropPath: null,
                backdropUrl,
                trailerId: null,
                cast: [],
                releaseYear: 2024,
              },
        };

        itemDetailsCache.set(item.id, { data: enriched, expires: Date.now() + 86400000 });
        return enriched;
      })
    );

    // Filtra para garantir que no banner SÓ passem títulos com backdrop widescreen de alta qualidade
    const finalHero = enrichedHeroItems.filter((it) => Boolean(it.tmdb?.backdropUrl));

    return jsonResponse({
      items: allItems,
      highlights,
      genres: getGenres(items),
      featuredHero: finalHero.length > 0 ? finalHero : enrichedHeroItems,
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
 * Route Handler /api/item com hidratação TMDB e cache longo
 */
async function handleItemApi(url: URL): Promise<Response> {
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "ID ausente" }, 400);

  const now = Date.now();
  const cached = itemDetailsCache.get(id);
  if (cached && cached.expires > now) {
    return jsonResponse(cached.data);
  }

  const { items } = await loadCatalog();
  const item = items.get(id) || Array.from(items.values()).find((i) => i.id === id);
  if (!item) return jsonResponse({ error: "Item não encontrado" }, 404);

  let finalItem = item;
  // Se ainda não carregou os streams deste item, busca instantaneamente pela letra correspondente
  if (!finalItem.streams || finalItem.streams.length === 0) {
    try {
      const streams = await getStreamsForItem(finalItem.type, finalItem.title);
      finalItem = { ...finalItem, streams };
    } catch {
      // Ignora e continua
    }
  }

  // Se for série, busca as temporadas e episódios completos
  if (finalItem.type === "s" && (!finalItem.seasons || finalItem.seasons.length === 0)) {
    try {
      const seasons = await getSeasonsForSeries(finalItem.title);
      if (seasons.length > 0) {
        finalItem = { ...finalItem, seasons };
      }
    } catch {
      // Ignora e continua
    }
  }

  if (item.tmdbId) {
    try {
      const tmdb = await getTmdbData(item.tmdbId, item.type);
      if (tmdb) {
        finalItem = { ...finalItem, tmdb };
      }
    } catch {
      // continua com os metadados existentes
    }
  }

  itemDetailsCache.set(id, { data: finalItem, expires: now + 3600000 });
  return jsonResponse(finalItem);
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
