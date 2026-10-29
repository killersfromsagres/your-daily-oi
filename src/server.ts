import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { loadCatalog, getGenres, searchItems, getStreamsForItem, getSeasonsForSeries, cleanDisplayTitle, normalizeTitle } from "./lib/catalog";
import { getTmdbData, getTmdbTvSeasons } from "./lib/tmdb";
import { getAniListMetadata } from "./lib/anilist";
import { getSushiCatalog, searchSushiAnimes, getSushiAnime, resolveSushiEpisodeStream } from "./lib/sushianimes";
import { loadCanais, loadRadios } from "./lib/canais";
import { getCanalEPG } from "./lib/epg";
import { getJogosHoje } from "./lib/jogos";
import { APP_VERSION } from "./lib/version";
import type { CatalogItem, SeasonItem } from "./lib/types";

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

    const rawAllItems = Array.from(items.values()).filter((i) => !i.alias);
    const seenCatalogKeys = new Set<string>();
    const allItems: CatalogItem[] = [];
    for (const item of rawAllItems) {
      const key = `${item.type}:${item.tmdbId ?? normalizeTitle(item.title)}`;
      if (!seenCatalogKeys.has(key)) {
        seenCatalogKeys.add(key);
        allItems.push(item);
      }
    }

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

  const tipoParam = url.searchParams.get("tipo");
  const typeKey = tipoParam
    ? (tipoParam === "movie" || tipoParam === "f" || tipoParam === "filme")
      ? "f"
      : (tipoParam === "anime" || tipoParam === "a")
      ? "a"
      : "s"
    : null;

  const now = Date.now();
  const cacheKey = typeKey ? `${typeKey}-${id}` : id;
  const cached = itemDetailsCache.get(cacheKey) || (!typeKey ? itemDetailsCache.get(id) : null);
  if (cached && cached.expires > now) {
    return jsonResponse(cached.data);
  }

  const { items } = await loadCatalog();
  const norm = normalizeTitle(id);
  const item =
    (typeKey ? items.get(`${typeKey}-${norm}`) : null) ||
    (typeKey ? Array.from(items.values()).find((i) => (i.id === id || normalizeTitle(i.title) === norm) && i.type === typeKey) : null) ||
    items.get(id) ||
    items.get(norm) ||
    Array.from(items.values()).find((i) => i.id === id || normalizeTitle(i.title) === norm);

  if (!item) {
    if (typeKey === "a" || id.includes("-") || tipoParam === "anime") {
      try {
        const sushiAnime = await getSushiAnime(id);
        if (sushiAnime) {
          itemDetailsCache.set(cacheKey, { data: sushiAnime, expires: now + 3600000 });
          return jsonResponse(sushiAnime);
        }
      } catch {}
    }
    return jsonResponse({ error: "Item não encontrado" }, 404);
  }

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

  // Se for série ou anime, busca as temporadas e episódios completos
  if ((finalItem.type === "s" || finalItem.type === "a") && (!finalItem.seasons || finalItem.seasons.length === 0)) {
    try {
      const seasons = await getSeasonsForSeries(finalItem.title, finalItem.type === "a" ? "a" : "s");
      if (seasons.length > 0) {
        finalItem = { ...finalItem, seasons };
      }
    } catch {
      // Ignora e continua
    }
  }

  if (item.tmdbId) {
    try {
      const tmdbType = item.type === "a" ? "s" : item.type;
      const tmdb = await getTmdbData(item.tmdbId, tmdbType);
      if (tmdb) {
        finalItem = { ...finalItem, tmdb };
      }
    } catch {
      // continua com os metadados existentes
    }
  }

  // Se for anime e após getSeasonsForSeries o seasons continuar vazio, gera temporadas sintéticas via TMDB
  if (finalItem.type === "a" && (!finalItem.seasons || finalItem.seasons.length === 0) && item.tmdbId) {
    try {
      const tmdbSeasons = await getTmdbTvSeasons(item.tmdbId);
      if (tmdbSeasons && tmdbSeasons.length > 0) {
        const syntheticSeasons: SeasonItem[] = tmdbSeasons
          .filter((s) => s.season_number > 0 && s.episode_count > 0)
          .map((s) => ({
            seasonNumber: s.season_number,
            episodes: Array.from({ length: s.episode_count }, (_, idx) => ({
              seasonNumber: s.season_number,
              episodeNumber: idx + 1,
              title: `Episódio ${idx + 1}`,
              streams: [],
            })),
          }));
        if (syntheticSeasons.length > 0) {
          finalItem = { ...finalItem, seasons: syntheticSeasons };
        }
      } else if (finalItem.tmdb?.seasonsCount && finalItem.tmdb.seasonsCount > 0) {
        const count = finalItem.tmdb.seasonsCount;
        const fallbackSeasons: SeasonItem[] = Array.from({ length: count }, (_, sIdx) => {
          const sNum = sIdx + 1;
          return {
            seasonNumber: sNum,
            episodes: Array.from({ length: 12 }, (_, eIdx) => ({
              seasonNumber: sNum,
              episodeNumber: eIdx + 1,
              title: `Episódio ${eIdx + 1}`,
              streams: [],
            })),
          };
        });
        finalItem = { ...finalItem, seasons: fallbackSeasons };
      }
    } catch {
      // Ignora e continua
    }
  }

  // Enriquecimento com AniList para animes (estúdio e formato)
  if (finalItem.type === "a") {
    try {
      const anilist = await getAniListMetadata(finalItem.title);
      if (anilist && finalItem.tmdb) {
        finalItem = {
          ...finalItem,
          tmdb: {
            ...finalItem.tmdb,
            studio: anilist.studio,
            format: anilist.format,
          },
        };
      }
    } catch {
      // continua sem AniList
    }
  }

  itemDetailsCache.set(cacheKey, { data: finalItem, expires: now + 3600000 });
  return jsonResponse(finalItem);
}

/**
 * Route Handler /api/resolve-vod (Play-First: nunca veta, devolve fontes ordenadas e relay)
 */
async function handleResolveVodApi(url: URL): Promise<Response> {
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "ID ausente" }, 400);

  const tipoParam = url.searchParams.get("tipo");
  const typeKey = (tipoParam === "movie" || tipoParam === "f" || tipoParam === "filme")
    ? "f"
    : (tipoParam === "anime" || tipoParam === "a")
    ? "a"
    : "s";

  const temp = parseInt(url.searchParams.get("temp") || "1", 10);
  const ep = parseInt(url.searchParams.get("ep") || "1", 10);

  const { items } = await loadCatalog();
  const norm = normalizeTitle(id);
  const item =
    items.get(`${typeKey}-${norm}`) ||
    Array.from(items.values()).find((i) => (i.id === id || normalizeTitle(i.title) === norm) && i.type === typeKey) ||
    items.get(id) ||
    items.get(norm) ||
    Array.from(items.values()).find((i) => i.id === id || normalizeTitle(i.title) === norm);

  if (!item) {
    if (typeKey === "a" || id.includes("-") || tipoParam === "anime") {
      try {
        const sushiSources = await resolveSushiEpisodeStream(id, temp, ep);
        if (sushiSources && sushiSources.length > 0) {
          return jsonResponse({
            id,
            title: id,
            tipo: "series",
            sources: sushiSources,
          });
        }
      } catch {}
    }
    return jsonResponse({ error: "Item não encontrado no catálogo" }, 404);
  }

  const tipo = tipoParam || (item.type === "f" ? "movie" : "series");

  const orderedSources: any[] = [];

  // 1. Para filmes: fontes nativas diretas do catálogo têm PRIORIDADE MÁXIMA
  // Elas reproduzem imediatamente via proxy com HTTP 206 sem depender de relay externo
  if (item.type === "f") {
    try {
      const directStreams = await getStreamsForItem("f", item.title);
      if (directStreams && directStreams.length > 0) {
        orderedSources.push(...directStreams);
      }
    } catch {
      // continua com as fontes de relay
    }
  } else {
    // 1b. Para séries e animes: a fonte exata do episódio (arquivo direto) vem SEMPRE antes do relay
    // (o relay de séries já foi observado servindo o episódio 1 da temporada 1 no navegador)
    try {
      const seasons = await getSeasonsForSeries(item.title, item.type === "a" ? "a" : "s");
      const foundSeason = seasons.find((s) => s.seasonNumber === temp);
      const foundEp = foundSeason?.episodes.find((e) => e.episodeNumber === ep);
      if (foundEp?.streams && foundEp.streams.length > 0) {
        orderedSources.push(...foundEp.streams);
      }
    } catch {
      // continua com as fontes de relay
    }
  }

  // 2. Injeta os streams oficiais do relay Saimo TV como contingência / fallback
  if (item.tmdbId) {
    if (tipo === "movie") {
      orderedSources.push({
        url: `https://saimo-tv.pages.dev/api/stream?tipo=movie&id=${item.tmdbId}&versao=dub`,
        audio: "dub",
        format: "mp4",
        quality: "FHD",
        name: "Servidor Principal (Dub)",
        priority: orderedSources.length,
      });
      orderedSources.push({
        url: `https://saimo-tv.pages.dev/api/stream?tipo=movie&id=${item.tmdbId}&versao=leg`,
        audio: "leg",
        format: "mp4",
        quality: "FHD",
        name: "Servidor Principal (Leg)",
        priority: orderedSources.length + 1,
      });
    } else {
      orderedSources.push({
        url: `https://saimo-tv.pages.dev/api/stream?tipo=series&id=${item.tmdbId}&temp=${temp}&ep=${ep}&versao=dub`,
        audio: "dub",
        format: "mp4",
        quality: "FHD",
        name: "Servidor Principal (Dub)",
        priority: orderedSources.length,
      });
      orderedSources.push({
        url: `https://saimo-tv.pages.dev/api/stream?tipo=series&id=${item.tmdbId}&temp=${temp}&ep=${ep}&versao=leg`,
        audio: "leg",
        format: "mp4",
        quality: "FHD",
        name: "Servidor Principal (Leg)",
        priority: orderedSources.length + 1,
      });
    }
  }

  return jsonResponse({
    id: item.id,
    title: item.title,
    tmdbId: item.tmdbId,
    tipo,
    sources: orderedSources,
  });
}

function isBlockedTargetUrl(target: string): boolean {
  try {
    const parsed = new URL(target);
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".lovable.app") ||
      host === "127.0.0.1" ||
      host.startsWith("127.") ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host === "::1" ||
      host === "[::1]"
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

interface HlsManifestCacheEntry {
  body: string;
  expires: number;
}
const hlsManifestCache = new Map<string, HlsManifestCacheEntry>();

function rewriteTagUris(line: string, baseUrl: string): string {
  return line.replace(/URI=(["']?)([^"',\s]+)\1/g, (match, quote, u) => {
    if (u.includes("/api/hls-proxy")) return match;
    try {
      const abs = new URL(u, baseUrl).toString();
      const q = quote || '"';
      return `URI=${q}/api/hls-proxy?url=${encodeURIComponent(abs)}${q}`;
    } catch {
      return match;
    }
  });
}

function rewriteHlsManifest(manifestText: string, baseUrl: string): string {
  const lines = manifestText.split("\n");
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      if (trimmed.includes("URI=")) {
        return rewriteTagUris(line, baseUrl);
      }
      return line;
    }

    if (trimmed.includes("/api/hls-proxy")) return line;
    try {
      const abs = new URL(trimmed, baseUrl).toString();
      return `/api/hls-proxy?url=${encodeURIComponent(abs)}`;
    } catch {
      return line;
    }
  });
  return rewritten.join("\n");
}

/**
 * Cache e Route Handler /api/relay-resolve
 * Resolve redirect 30x de saimo-tv.pages.dev/api/stream, aplica upgrade http->https e sniffer de HLS
 */
interface RelayResolveCache {
  data: { ok: boolean; finalUrl?: string; isHls?: boolean };
  expires: number;
}
const relayResolveCache = new Map<string, RelayResolveCache>();

async function handleRelayResolveApi(url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl || !targetUrl.includes("saimo-tv.pages.dev/api/stream")) {
    return jsonResponse({ ok: false, error: "URL inválida ou não suportada" }, 400);
  }

  const now = Date.now();
  const cached = relayResolveCache.get(targetUrl);
  if (cached && cached.expires > now) {
    return jsonResponse(cached.data, 200, "no-store");
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);

    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://saimo-tv.pages.dev/",
        Accept: "*/*",
      },
      redirect: "manual",
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    let loc = res.headers.get("location") || res.headers.get("Location");
    if (!loc) {
      relayResolveCache.set(targetUrl, { data: { ok: false }, expires: now + 60000 });
      return jsonResponse({ ok: false }, 200, "no-store");
    }

    if (loc.startsWith("http://")) {
      loc = loc.replace(/^http:\/\//i, "https://");
    }

    let isHls = false;
    const cleanLoc = loc.split("?")[0].toLowerCase();
    if (cleanLoc.endsWith(".m3u8") || loc.includes(".m3u8")) {
      isHls = true;
    } else {
      try {
        const sniffCtrl = new AbortController();
        const sniffTimer = setTimeout(() => sniffCtrl.abort(), 3000);
        const sniffRes = await fetch(loc, {
          method: "HEAD",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Referer: "https://saimo-tv.pages.dev/",
          },
          signal: sniffCtrl.signal,
        });
        clearTimeout(sniffTimer);
        const ct = (sniffRes.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/vnd.apple.mpegurl") || ct.includes("audio/mpegurl") || ct.includes("mpegurl")) {
          isHls = true;
        }
      } catch {
        // Fallback mp4
      }
    }

    const result = { ok: true, finalUrl: loc, isHls };
    relayResolveCache.set(targetUrl, { data: result, expires: now + 5 * 60 * 1000 });
    return jsonResponse(result, 200, "no-store");
  } catch (err) {
    console.warn(`[RelayResolve] Falha ao resolver ${targetUrl}:`, err);
    return jsonResponse({ ok: false }, 200, "no-store");
  }
}

/**
 * Route Handler /api/hls-proxy (Proxy HLS com reescrita completa de manifestos e streaming transparente de segmentos)
 */
async function handleHlsProxyApi(request: Request, url: URL): Promise<Response> {
  let targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response("URL ausente", { status: 400 });
  }

  // Previne encadeamento de proxy sobre proxy
  while (targetUrl.includes("/api/hls-proxy?url=") || targetUrl.includes("/api/proxy-stream?url=")) {
    try {
      const parsed = new URL(targetUrl, url.origin);
      const inner = parsed.searchParams.get("url");
      if (inner && inner !== targetUrl) {
        targetUrl = inner;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new Response("URL inválida", { status: 400 });
  }

  if (isBlockedTargetUrl(targetUrl)) {
    return new Response("Acesso proibido a URLs internas", {
      status: 403,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const clientRange = request.headers.get("range");

  // Cache leve em memória de manifestos (60s) — apenas para requisições GET sem Range
  if (!clientRange && request.method === "GET") {
    const cached = hlsManifestCache.get(targetUrl);
    if (cached && cached.expires > Date.now()) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Cache-Control": "public, max-age=60",
        },
      });
    }
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://saimo-tv.pages.dev/",
      Origin: "https://saimo-tv.pages.dev",
      Accept: "*/*",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    const customReferer = url.searchParams.get("referer");
    if (customReferer) {
      upstreamHeaders["Referer"] = customReferer;
      try {
        upstreamHeaders["Origin"] = new URL(customReferer).origin;
      } catch {}
    } else if (
      targetUrl.includes("sushianimes.com.br") ||
      targetUrl.includes("maximaimg.online") ||
      targetUrl.includes("pixel-sus-4k-image.com") ||
      targetUrl.includes("playsus.online")
    ) {
      upstreamHeaders["Referer"] = "https://sushianimes.com.br/";
      upstreamHeaders["Origin"] = "https://sushianimes.com.br";
    }

    const customUa = url.searchParams.get("ua") || url.searchParams.get("agente");
    if (customUa) {
      upstreamHeaders["User-Agent"] = customUa;
    }

    if (clientRange) {
      upstreamHeaders["Range"] = clientRange;
    }

    const clientAcceptEncoding = request.headers.get("accept-encoding");
    if (clientAcceptEncoding) {
      upstreamHeaders["Accept-Encoding"] = clientAcceptEncoding;
    }

    // Se for relay do Saimo TV, primeiro resolve o redirect 302 sem Range para obter a URL final real do CDN
    if (targetUrl.includes("saimo-tv.pages.dev/api/stream")) {
      const redirectCtrl = new AbortController();
      const redirectTimer = setTimeout(() => redirectCtrl.abort(), 12000);
      try {
        const redirectRes = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent": upstreamHeaders["User-Agent"],
            Referer: "https://saimo-tv.pages.dev/",
            Accept: "*/*",
          },
          redirect: "manual",
          signal: redirectCtrl.signal,
        });
        clearTimeout(redirectTimer);
        const isRedirect = redirectRes.status >= 300 && redirectRes.status < 400;
        let loc = redirectRes.headers.get("location") || redirectRes.headers.get("Location");
        if (loc) {
          if (loc.startsWith("http://")) {
            loc = loc.replace(/^http:\/\//i, "https://");
          }
          if (loc.includes("froststream") || loc.includes("cloutteam")) {
            return new Response("Upstream requer resolução direta no navegador", {
              status: 502,
              headers: { "Access-Control-Allow-Origin": "*" },
            });
          }
          targetUrl = loc;
        } else if (!redirectRes.ok && !isRedirect) {
          return new Response("Relay upstream indisponível", {
            status: 502,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
      } catch {
        clearTimeout(redirectTimer);
      }
    }

    if (targetUrl.includes("hermesnewone.com") && targetUrl.startsWith("http://")) {
      targetUrl = targetUrl.replace("http://", "https://");
    }

    const fetchCtrl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtrl.abort(), 12000);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "follow",
        signal: fetchCtrl.signal,
      });
      clearTimeout(fetchTimer);
    } catch (fetchErr) {
      clearTimeout(fetchTimer);
      console.warn(`[HlsProxy] Timeout ou falha upstream para ${targetUrl}:`, fetchErr);
      return new Response("Timeout ao conectar ao servidor upstream HLS", {
        status: 504,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Se o upstream rejeitar Range com 416 (Accept-Ranges: none), retenta imediatamente sem Range
    if (res.status === 416 && upstreamHeaders["Range"]) {
      delete upstreamHeaders["Range"];
      const retryCtrl = new AbortController();
      const retryTimer = setTimeout(() => retryCtrl.abort(), 12000);
      try {
        res = await fetch(targetUrl, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: upstreamHeaders,
          redirect: "follow",
          signal: retryCtrl.signal,
        });
        clearTimeout(retryTimer);
      } catch (retryErr) {
        clearTimeout(retryTimer);
        return new Response("Timeout na retentativa sem Range", {
          status: 504,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    if (!res.ok) {
      console.warn(`[HlsProxy] Upstream retornou status ${res.status} para ${targetUrl}`);
      return new Response(`Erro upstream ${res.status}`, {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const rawContentType = res.headers.get("content-type") || "";
    const lowerTarget = targetUrl.toLowerCase();
    const isSegmentHint =
      Boolean(clientRange) ||
      lowerTarget.includes(".ts") ||
      lowerTarget.includes(".m4s") ||
      lowerTarget.includes(".aac") ||
      rawContentType.includes("video/mp2t") ||
      rawContentType.includes("video/mp4");

    // Se NÃO for claramente um segmento binário, tenta ler como texto de manifesto
    if (!isSegmentHint) {
      const text = await res.text();
      const trimmed = text.trim();
      if (
        trimmed.startsWith("#EXTM3U") ||
        trimmed.includes("#EXTINF") ||
        trimmed.includes("#EXT-X-STREAM-INF")
      ) {
        const finalBase = res.url || targetUrl;
        const rewritten = rewriteHlsManifest(text, finalBase);

        if (hlsManifestCache.size > 200) {
          const now = Date.now();
          for (const [k, v] of hlsManifestCache) {
            if (v.expires < now) hlsManifestCache.delete(k);
          }
          if (hlsManifestCache.size > 300) hlsManifestCache.clear();
        }
        hlsManifestCache.set(targetUrl, {
          body: rewritten,
          expires: Date.now() + 60000,
        });

        return new Response(rewritten, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=60",
          },
        });
      }

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "*");
      headers.set("Content-Type", rawContentType || "text/plain");
      return new Response(text, { status: res.status, headers });
    }

    // Segmento binário (.ts, .m4s, etc.): streaming via pipe direto com Range
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    const contentType = rawContentType || "video/mp2t";
    responseHeaders.set("Content-Type", contentType);

    const contentLength = res.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = res.headers.get("content-range");
    if (contentRange && res.status === 206) {
      responseHeaders.set("Content-Range", contentRange);
    }

    const acceptRanges = res.headers.get("accept-ranges") || (res.status === 206 ? "bytes" : "bytes");
    responseHeaders.set("Accept-Ranges", acceptRanges);

    return new Response(request.method === "HEAD" ? null : res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("Erro no hls-proxy:", err);
    return new Response("Erro no proxy HLS", { status: 502 });
  }
}

function rewriteLiveTagUris(line: string, baseUrl: string, referer?: string, ua?: string): string {
  return line.replace(/URI=(["']?)([^"',\s]+)\1/g, (match, quote, u) => {
    if (u.includes("/api/live-proxy")) return match;
    try {
      const abs = new URL(u, baseUrl).toString();
      const q = quote || '"';
      let target = `/api/live-proxy?url=${encodeURIComponent(abs)}`;
      if (referer) target += `&referer=${encodeURIComponent(referer)}`;
      if (ua) target += `&ua=${encodeURIComponent(ua)}`;
      return `URI=${q}${target}${q}`;
    } catch {
      return match;
    }
  });
}

function rewriteLiveHlsManifest(manifestText: string, baseUrl: string, referer?: string, ua?: string): string {
  const lines = manifestText.split("\n");
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      if (trimmed.includes("URI=")) {
        return rewriteLiveTagUris(line, baseUrl, referer, ua);
      }
      return line;
    }

    if (trimmed.includes("/api/live-proxy")) return line;
    try {
      const abs = new URL(trimmed, baseUrl).toString();
      let target = `/api/live-proxy?url=${encodeURIComponent(abs)}`;
      if (referer) target += `&referer=${encodeURIComponent(referer)}`;
      if (ua) target += `&ua=${encodeURIComponent(ua)}`;
      return target;
    } catch {
      return line;
    }
  });
  return rewritten.join("\n");
}

const liveManifestCache = new Map<string, { body: string; expires: number }>();

/**
 * Route Handler /api/live-proxy (Proxy HLS ao vivo com headers customizados e reescrita de segmentos)
 */
async function handleLiveProxyApi(request: Request, url: URL): Promise<Response> {
  let targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response("URL ausente", { status: 400 });
  }

  while (targetUrl.includes("/api/live-proxy?url=") || targetUrl.includes("/api/hls-proxy?url=")) {
    try {
      const parsed = new URL(targetUrl, url.origin);
      const inner = parsed.searchParams.get("url");
      if (inner && inner !== targetUrl) targetUrl = inner;
      else break;
    } catch {
      break;
    }
  }

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new Response("URL inválida", { status: 400 });
  }

  if (isBlockedTargetUrl(targetUrl)) {
    return new Response("Acesso proibido a URLs internas", {
      status: 403,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const customReferer = url.searchParams.get("referer") || undefined;
  const customUa = url.searchParams.get("ua") || url.searchParams.get("agente") || undefined;
  const clientRange = request.headers.get("range");

  // Cache leve de manifesto ao vivo (10s)
  if (!clientRange && request.method === "GET") {
    const cached = liveManifestCache.get(targetUrl);
    if (cached && cached.expires > Date.now()) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Cache-Control": "public, max-age=10",
        },
      });
    }
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent":
        customUa ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    if (customReferer) {
      upstreamHeaders["Referer"] = customReferer;
      try {
        upstreamHeaders["Origin"] = new URL(customReferer).origin;
      } catch {}
    } else {
      upstreamHeaders["Referer"] = "https://saimo-tv.pages.dev/";
      upstreamHeaders["Origin"] = "https://saimo-tv.pages.dev";
    }

    if (clientRange) {
      upstreamHeaders["Range"] = clientRange;
    }

    const clientAcceptEncoding = request.headers.get("accept-encoding");
    if (clientAcceptEncoding) {
      upstreamHeaders["Accept-Encoding"] = clientAcceptEncoding;
    }

    const fetchCtrl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtrl.abort(), 12000);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "follow",
        signal: fetchCtrl.signal,
      });
      clearTimeout(fetchTimer);
    } catch {
      clearTimeout(fetchTimer);
      return new Response("Timeout ao conectar ao upstream ao vivo", {
        status: 504,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    if (res.status === 416 && upstreamHeaders["Range"]) {
      delete upstreamHeaders["Range"];
      const retryCtrl = new AbortController();
      const retryTimer = setTimeout(() => retryCtrl.abort(), 12000);
      try {
        res = await fetch(targetUrl, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: upstreamHeaders,
          redirect: "follow",
          signal: retryCtrl.signal,
        });
        clearTimeout(retryTimer);
      } catch {
        clearTimeout(retryTimer);
      }
    }

    if (!res.ok) {
      return new Response(`Erro upstream ${res.status}`, {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const rawContentType = res.headers.get("content-type") || "";
    const lowerTarget = targetUrl.toLowerCase();
    const isSegment =
      Boolean(clientRange) ||
      lowerTarget.includes(".ts") ||
      lowerTarget.includes(".m4s") ||
      lowerTarget.includes(".aac") ||
      rawContentType.includes("video/mp2t") ||
      rawContentType.includes("video/mp4");

    if (!isSegment) {
      const text = await res.text();
      const trimmed = text.trim();
      if (
        trimmed.startsWith("#EXTM3U") ||
        trimmed.includes("#EXTINF") ||
        trimmed.includes("#EXT-X-STREAM-INF")
      ) {
        const finalBase = res.url || targetUrl;
        const rewritten = rewriteLiveHlsManifest(text, finalBase, customReferer, customUa);

        if (liveManifestCache.size > 200) {
          const now = Date.now();
          for (const [k, v] of liveManifestCache) {
            if (v.expires < now) liveManifestCache.delete(k);
          }
          if (liveManifestCache.size > 300) liveManifestCache.clear();
        }
        liveManifestCache.set(targetUrl, {
          body: rewritten,
          expires: Date.now() + 10000,
        });

        return new Response(rewritten, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=10",
          },
        });
      }

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "*");
      headers.set("Content-Type", rawContentType || "text/plain");
      return new Response(text, { status: res.status, headers });
    }

    // Segmento binário (.ts, .m4s): streaming pipe
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    const contentType = rawContentType || "video/mp2t";
    responseHeaders.set("Content-Type", contentType);

    const contentLength = res.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = res.headers.get("content-range");
    if (contentRange && res.status === 206) {
      responseHeaders.set("Content-Range", contentRange);
    }

    const acceptRanges = res.headers.get("accept-ranges") || (res.status === 206 ? "bytes" : "bytes");
    responseHeaders.set("Accept-Ranges", acceptRanges);

    return new Response(request.method === "HEAD" ? null : res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("Erro no live-proxy:", err);
    return new Response("Erro no proxy de transmissão ao vivo", { status: 502 });
  }
}

/**
 * Route Handler /api/proxy-stream (Proxy retransmissor transparente com Range, Referer e User-Agent)
 */
async function handleProxyStreamApi(request: Request, url: URL): Promise<Response> {
  let targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response("URL ausente", { status: 400 });
  }

  // Previne encadeamento de proxy sobre proxy
  while (targetUrl.includes("/api/proxy-stream?url=")) {
    try {
      const parsed = new URL(targetUrl, url.origin);
      const inner = parsed.searchParams.get("url");
      if (inner && inner !== targetUrl) {
        targetUrl = inner;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new Response("URL inválida", { status: 400 });
  }

  if (isBlockedTargetUrl(targetUrl)) {
    return new Response("Acesso proibido a URLs internas", {
      status: 403,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://saimo-tv.pages.dev/",
      Origin: "https://saimo-tv.pages.dev",
      Accept: "*/*",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    const customReferer = url.searchParams.get("referer");
    if (customReferer) {
      upstreamHeaders["Referer"] = customReferer;
      try {
        upstreamHeaders["Origin"] = new URL(customReferer).origin;
      } catch {}
    } else if (
      targetUrl.includes("sushianimes.com.br") ||
      targetUrl.includes("maximaimg.online") ||
      targetUrl.includes("pixel-sus-4k-image.com") ||
      targetUrl.includes("playsus.online")
    ) {
      upstreamHeaders["Referer"] = "https://sushianimes.com.br/";
      upstreamHeaders["Origin"] = "https://sushianimes.com.br";
    }

    const customUa = url.searchParams.get("ua") || url.searchParams.get("agente");
    if (customUa) {
      upstreamHeaders["User-Agent"] = customUa;
    }

    const clientRange = request.headers.get("range");
    if (clientRange) {
      upstreamHeaders["Range"] = clientRange;
    }

    const clientAcceptEncoding = request.headers.get("accept-encoding");
    if (clientAcceptEncoding) {
      upstreamHeaders["Accept-Encoding"] = clientAcceptEncoding;
    }

    // 1. Se for o relay do Saimo TV, primeiro resolve o redirect 302 sem Range para obter a URL final real do CDN
    if (targetUrl.includes("saimo-tv.pages.dev/api/stream")) {
      const redirectCtrl = new AbortController();
      const redirectTimer = setTimeout(() => redirectCtrl.abort(), 12000);
      try {
        const redirectRes = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent": upstreamHeaders["User-Agent"],
            Referer: "https://saimo-tv.pages.dev/",
            Accept: "*/*",
          },
          redirect: "manual",
          signal: redirectCtrl.signal,
        });
        clearTimeout(redirectTimer);
        const isRedirect = redirectRes.status >= 300 && redirectRes.status < 400;
        let loc = redirectRes.headers.get("location") || redirectRes.headers.get("Location");
        if (loc) {
          if (loc.startsWith("http://")) {
            loc = loc.replace(/^http:\/\//i, "https://");
          }
          // Se o upstream redirecionou para bot challenge de datacenter (froststream / cloutteam)
          // Retorna 502 imediatamente para o player tentar o caminho direto do navegador
          if (loc.includes("froststream") || loc.includes("cloutteam")) {
            return new Response("Upstream requer resolução direta no navegador", {
              status: 502,
              headers: { "Access-Control-Allow-Origin": "*" },
            });
          }
          targetUrl = loc;
        } else if (!redirectRes.ok && !isRedirect) {
          return new Response("Relay upstream indisponível", {
            status: 502,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
      } catch {
        clearTimeout(redirectTimer);
        // continua
      }
    }

    // Se o CDN for hermesnewone em http://, converte para https://
    // (Na Vercel/datacenters, requisições em http puro caem no Cloudflare Bot Challenge; em https passam limpas com 206)
    if (targetUrl.includes("hermesnewone.com") && targetUrl.startsWith("http://")) {
      targetUrl = targetUrl.replace("http://", "https://");
    }

    // AbortController de 12s para receber os headers da resposta upstream
    // Não aborta o corpo depois de receber os headers para não interromper a reprodução do vídeo
    const fetchCtrl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtrl.abort(), 12000);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: request.method === "HEAD" ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "follow",
        signal: fetchCtrl.signal,
      });
      // Headers recebidos com sucesso: cancela o timeout para permitir streaming contínuo do corpo
      clearTimeout(fetchTimer);
    } catch (fetchErr) {
      clearTimeout(fetchTimer);
      console.warn(`[ProxyStream] Timeout ou falha upstream para ${targetUrl}:`, fetchErr);
      return new Response("Timeout ao conectar ao servidor upstream de vídeo", {
        status: 504,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Se o upstream rejeitar Range com 416 (Accept-Ranges: none), retenta imediatamente sem Range
    if (res.status === 416 && upstreamHeaders["Range"]) {
      delete upstreamHeaders["Range"];
      const retryCtrl = new AbortController();
      const retryTimer = setTimeout(() => retryCtrl.abort(), 12000);
      try {
        res = await fetch(targetUrl, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: upstreamHeaders,
          redirect: "follow",
          signal: retryCtrl.signal,
        });
        clearTimeout(retryTimer);
      } catch (retryErr) {
        clearTimeout(retryTimer);
        return new Response("Timeout na retentativa sem Range", {
          status: 504,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // Se o upstream retornar erro ou página não-vídeo (como Cloudflare Challenge ou erro JSON),
    // retorne 502 rápido para o player avançar imediatamente para a próxima fonte
    if (!res.ok) {
      const resContentType = res.headers.get("content-type") || "";
      if (
        res.status === 403 ||
        res.status === 404 ||
        resContentType.includes("text/html") ||
        resContentType.includes("application/json")
      ) {
        console.warn(`[ProxyStream] Upstream retornou status ${res.status} (${resContentType}) para ${targetUrl}`);
        return new Response(`Erro upstream ${res.status}`, {
          status: 502,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    const contentType = res.headers.get("content-type") || "video/mp4";
    if (contentType.toLowerCase().includes("text/html")) {
      console.warn(`[ProxyStream] Upstream retornou HTML em vez de vídeo para ${targetUrl}`);
      return new Response("Erro upstream html", {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    responseHeaders.set("Content-Type", contentType);

    const contentLength = res.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = res.headers.get("content-range");
    if (contentRange && res.status === 206) {
      responseHeaders.set("Content-Range", contentRange);
    }

    const acceptRanges = res.headers.get("accept-ranges") || (res.status === 206 ? "bytes" : "none");
    responseHeaders.set("Accept-Ranges", acceptRanges);

    return new Response(request.method === "HEAD" ? null : res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("Erro no proxy-stream:", err);
    return new Response("Erro no proxy de vídeo", { status: 502 });
  }
}

/**
 * Route Handler /api/animes-sushi (Busca e catálogo paginado de animes)
 */
async function handleAnimesSushiApi(url: URL): Promise<Response> {
  const q = url.searchParams.get("q") || "";
  const pagina = parseInt(url.searchParams.get("pagina") || url.searchParams.get("page") || "1", 10);
  const categoria = url.searchParams.get("categoria") || url.searchParams.get("category") || "";

  if (q.trim()) {
    const items = await searchSushiAnimes(q.trim());
    return jsonResponse({
      items,
      pagina: 1,
      totalPaginas: 1,
      totalItens: items.length,
    });
  }

  const result = await getSushiCatalog(isNaN(pagina) || pagina < 1 ? 1 : pagina, categoria);
  return jsonResponse(result);
}

/**
 * Route Handler /api/anime-sushi (Ficha detalhada de um anime com temporadas e episódios)
 */
async function handleAnimeSushiApi(url: URL): Promise<Response> {
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "ID ausente" }, 400);

  const anime = await getSushiAnime(id);
  if (!anime) return jsonResponse({ error: "Anime não encontrado" }, 404);

  return jsonResponse(anime);
}

/**
 * Route Handler /api/anime-sushi/episodio (Resolução das fontes de vídeo de um episódio)
 */
async function handleAnimeSushiEpisodioApi(url: URL): Promise<Response> {
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "ID ausente" }, 400);

  const temp = parseInt(url.searchParams.get("temp") || "1", 10);
  const ep = parseInt(url.searchParams.get("ep") || "1", 10);
  const epSlug = url.searchParams.get("epSlug") || undefined;

  const sources = await resolveSushiEpisodeStream(id, isNaN(temp) ? 1 : temp, isNaN(ep) ? 1 : ep, epSlug);
  return jsonResponse({
    id,
    temp,
    ep,
    sources,
  });
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
      if (url.pathname === "/api/version") {
        return jsonResponse(APP_VERSION);
      }
      if (url.pathname === "/api/item") {
        return await handleItemApi(url);
      }
      if (url.pathname === "/api/resolve-vod") {
        return await handleResolveVodApi(url);
      }
      if (url.pathname === "/api/relay-resolve") {
        return await handleRelayResolveApi(url);
      }
      if (url.pathname === "/api/proxy-stream") {
        return await handleProxyStreamApi(request, url);
      }
      if (url.pathname === "/api/hls-proxy") {
        return await handleHlsProxyApi(request, url);
      }
      if (url.pathname === "/api/live-proxy") {
        return await handleLiveProxyApi(request, url);
      }
      if (url.pathname === "/api/canais") {
        const data = await loadCanais();
        return jsonResponse(data, 200, "public, max-age=3600");
      }
      if (url.pathname === "/api/radios") {
        const data = await loadRadios();
        return jsonResponse(data, 200, "public, max-age=3600");
      }
      if (url.pathname === "/api/epg") {
        const canal = url.searchParams.get("canal") || "";
        const data = await getCanalEPG(canal);
        return jsonResponse(data, 200, "public, max-age=900");
      }
      if (url.pathname === "/api/jogos-hoje") {
        const data = await getJogosHoje();
        return jsonResponse(data, 200, "public, max-age=1800");
      }
      if (url.pathname === "/api/animes-sushi") {
        return await handleAnimesSushiApi(url);
      }
      if (url.pathname === "/api/anime-sushi") {
        return await handleAnimeSushiApi(url);
      }
      if (url.pathname === "/api/anime-sushi/episodio") {
        return await handleAnimeSushiEpisodioApi(url);
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
