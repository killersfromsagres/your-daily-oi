/**
 * Módulo de Streaming VOD de Filmes e Séries — Padrão Saimo TV
 *
 * Integra:
 * 1. Provedor FenixFlix (streams diretos FHD/4K, Dublado e Legendado)
 * 2. Catálogo RedeFlix Oficial (embedplayer2.xyz HLS, koyeb MP4)
 * 3. Expansão de Base Saimo (indice.txt + filmes-X.txt / series-X-Y.txt)
 * 4. Fallback por IMDb ID via TMDB External IDs
 */

import type { StreamSource, AudioTrack, StreamFormat } from "./types";
import { fetchFirstText, sourceUrls } from "./saimo-source";
import { buildSaimoVodProxyUrl } from "./saimo-vod-url";

const FENIX_BASE = "https://fenixflix.fenixhub.online";
const CATALOG_BASE = process.env.SAIMO_VOD_PAGES || "https://filmes-saimo.pages.dev";
const STREAM_API = process.env.SAIMO_STREAM_API || "https://saimo-tv.pages.dev/api/stream";
function catalogUrls(fileName: string): string[] {
  return sourceUrls(process.env.SAIMO_VOD_MIRRORS, [CATALOG_BASE])
    .map((root) => `${root}/${fileName}`);
}
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TMDB_API_KEY = "15d2ea6d0dc1d476efbca3eba2b9bbfb";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const STREAM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

let basesCache: string[] | null = null;
let basesCacheTime = 0;

let redeflixFilmesCache: Map<string, { title: string; streams: StreamSource[] }> | null = null;
let redeflixFilmesCacheTime = 0;

interface RedeFlixSeriesEntry {
  title: string;
  tmdbId: string;
  episodes: Map<string, StreamSource[]>;
}
let redeflixSeriesCache: Map<string, RedeFlixSeriesEntry> | null = null;
let redeflixSeriesCacheTime = 0;

const streamResultsCache = new Map<string, { streams: StreamSource[]; expires: number }>();
const saimoStreamCache = new Map<string, { streams: StreamSource[]; expires: number }>();

export function isHlsUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.toLowerCase().split("?")[0];
  return (
    clean.includes(".m3u8") ||
    clean.endsWith(".txt") ||
    url.includes("dadinhodetapioca.fun") ||
    url.includes("embedplayer2.xyz") ||
    url.includes("/api/hls-proxy") ||
    url.includes("/api/live-proxy")
  );
}

export function detectVodQuality(url: string, name?: string): string {
  const t = `${url} ${name || ""}`.toLowerCase();
  if (t.includes("4k") || t.includes("2160") || t.includes("uhd")) return "4K";
  if (t.includes("2k") || t.includes("1440") || t.includes("qhd")) return "2K";
  if (t.includes("1080") || t.includes("fhd") || t.includes("fullhd")) return "1080p";
  if (t.includes("720") || t.includes("hd")) return "720p";
  if (t.includes("480") || t.includes("sd")) return "480p";
  return "1080p";
}

/**
 * Carrega a tabela de bases do indice.txt do Saimo
 */
export async function getIndiceBases(): Promise<string[]> {
  const now = Date.now();
  if (basesCache && now - basesCacheTime < CACHE_TTL_MS) {
    return basesCache;
  }

  try {
    const candidates = [
      ...catalogUrls("indice.txt"),
      ...(process.env.SAIMO_VOD_RAW ? [`${process.env.SAIMO_VOD_RAW.replace(/\/$/, "")}/indice.txt`] : []),
    ];
    const { text } = await fetchFirstText(candidates, "índice de bases", { timeoutMs: 5000 });
    const bases: string[] = [];
    for (const line of text.split("\n")) {
      if (!line.startsWith("base:")) continue;
      const parts = line.slice(5).trim().split(/\s+/);
      const id = Number(parts[0]);
      if (Number.isInteger(id) && id >= 0 && id <= 9999 && parts.length >= 2) {
        bases[id] = parts.slice(1).join(" ");
      }
    }
    basesCache = bases;
    basesCacheTime = now;
    return bases;
  } catch (err) {
    console.warn("[SaimoStream] Índice de bases indisponível:", String(err));
    basesCacheTime = now - CACHE_TTL_MS + 60_000;
  }

  return basesCache || [];
}

/**
 * Expande tokens de base do catálogo Saimo (ex: "10:2456332" -> "http://corruptx.org:80/.../2456332.mp4")
 */
export function expandBaseToken(token: string, bases: string[]): string {
  if (!token) return "";
  const t = token.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  const colon = t.indexOf(":");
  if (colon <= 0) return "";
  const idx = Number(t.slice(0, colon));
  if (!Number.isInteger(idx)) return "";
  const base = bases[idx];
  if (!base || base.includes("desativado.invalid")) return "";
  const rest = t.slice(colon + 1);
  return rest.includes(".") ? `${base}${rest}` : `${base}${rest}.mp4`;
}

/**
 * Carrega o mapa de links da RedeFlix para filmes
 */
async function getRedeflixFilmes(): Promise<Map<string, { title: string; streams: StreamSource[] }>> {
  const now = Date.now();
  if (redeflixFilmesCache && now - redeflixFilmesCacheTime < CACHE_TTL_MS) {
    return redeflixFilmesCache;
  }

  const map = new Map<string, { title: string; streams: StreamSource[] }>();
  try {
    const res = await fetch(`${CATALOG_BASE}/redeflix/links-filmes.txt`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/plain, */*" },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const text = await res.text();
      for (const line of text.split("\n")) {
        const parts = line.split("\t");
        if (parts.length < 2) continue;
        const title = parts[0]?.trim();
        let tmdb = "";
        let imdb = "";
        const streams: StreamSource[] = [];

        for (const p of parts.slice(1)) {
          if (p.startsWith("tmdb=")) tmdb = p.slice(5).trim();
          else if (p.startsWith("imdb=")) imdb = p.slice(5).trim();
          else if (p.startsWith("dub=") || p.startsWith("leg=")) {
            const isDub = p.startsWith("dub=");
            const audio: AudioTrack = isDub ? "dub" : "leg";
            const url = p.slice(4).trim();
            if (url.startsWith("http")) {
              streams.push({
                url,
                audio,
                quality: "1080p",
                format: isHlsUrl(url) ? "hls" : "mp4",
                name: `Servidor Principal (${audio.toUpperCase()})`,
                priority: 0,
              });
            }
          }
        }

        if (tmdb && streams.length > 0) {
          map.set(tmdb, { title, streams });
        }
        if (imdb && streams.length > 0) {
          map.set(imdb, { title, streams });
        }
      }
      redeflixFilmesCache = map;
      redeflixFilmesCacheTime = now;
    }
  } catch (err) {
    console.warn("[SaimoStream] Falha ao obter redeflix links-filmes.txt:", err);
  }

  return redeflixFilmesCache || map;
}

/**
 * Carrega o mapa de links da RedeFlix para séries
 */
async function getRedeflixSeries(): Promise<Map<string, RedeFlixSeriesEntry>> {
  const now = Date.now();
  if (redeflixSeriesCache && now - redeflixSeriesCacheTime < CACHE_TTL_MS) {
    return redeflixSeriesCache;
  }

  const map = new Map<string, RedeFlixSeriesEntry>();
  try {
    const res = await fetch(`${CATALOG_BASE}/redeflix/links-series.txt`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/plain, */*" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const text = await res.text();
      let current: RedeFlixSeriesEntry | null = null;

      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("@")) {
          const parts = trimmed.slice(1).split("\t");
          const title = parts[0]?.trim() || "";
          const tmdbId = parts[2]?.trim() || "";
          current = { title, tmdbId, episodes: new Map() };
          if (tmdbId) map.set(tmdbId, current);
          continue;
        }
        if (!current) continue;

        const parts = line.split("\t");
        if (parts.length >= 4) {
          const temp = Number(parts[0]) || 1;
          const ep = Number(parts[1]) || 1;
          const versaoRaw = parts[2]?.trim().toLowerCase() || "dub";
          const audio: AudioTrack = versaoRaw === "leg" ? "leg" : "dub";
          const url = parts[3]?.trim() || "";
          if (url.startsWith("http")) {
            const key = `${temp}:${ep}`;
            if (!current.episodes.has(key)) current.episodes.set(key, []);
            current.episodes.get(key)!.push({
              url,
              audio,
              quality: "1080p",
              format: isHlsUrl(url) ? "hls" : "mp4",
              name: `Servidor Principal (${audio.toUpperCase()})`,
              priority: 0,
            });
          }
        }
      }
      redeflixSeriesCache = map;
      redeflixSeriesCacheTime = now;
    }
  } catch (err) {
    console.warn("[SaimoStream] Falha ao obter redeflix links-series.txt:", err);
  }

  return redeflixSeriesCache || map;
}

/**
 * Consulta a API de addon FenixFlix do Saimo
 */
async function queryFenixFlix(
  isSerie: boolean,
  targetId: string,
  season = 1,
  episode = 1
): Promise<StreamSource[]> {
  const prefixId = targetId.startsWith("tt") ? targetId : `tmdb:${targetId}`;
  const url = isSerie
    ? `${FENIX_BASE}/stream/series/${prefixId}:${season}:${episode}.json`
    : `${FENIX_BASE}/stream/movie/${prefixId}.json`;

  const sources: StreamSource[] = [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(5500),
    });

    if (res.ok) {
      const data = (await res.json()) as { streams?: Array<Record<string, unknown>> };
      if (Array.isArray(data?.streams)) {
        for (const st of data.streams) {
          const rawUrl = typeof st.url === "string" ? st.url.trim() : "";
          if (!rawUrl || !rawUrl.startsWith("http")) continue;

          // Ignora redirects de domínios que estão temporariamente offline
          if (rawUrl.includes("fenixflix.fenixhub.online/r/")) continue;

          const texto = `${String(st.name || "")} ${String(st.title || "")}`.toLowerCase();
          const isLeg = texto.includes("leg") || texto.includes("sub") || texto.includes("legendado");
          const audio: AudioTrack = isLeg ? "leg" : "dub";
          const quality = detectVodQuality(rawUrl, String(st.name || ""));
          const format: StreamFormat = isHlsUrl(rawUrl) ? "hls" : "mp4";

          sources.push({
            name: String(st.name || `FenixFlix ${quality}`),
            url: rawUrl,
            audio,
            quality,
            format,
            priority: 1,
          });
        }
      }
    }
  } catch {
    // continua para fallback
  }

  return sources;
}

/**
 * Consulta o endpoint público de redirecionamento da Saimo para cada idioma.
 * Nunca marca uma resposta HTML como vídeo ou assume qualidade sem metadados.
 */
async function querySaimoOfficial(
  tipo: "movie" | "series",
  id: string,
  season: number,
  episode: number,
): Promise<StreamSource[]> {
  if (!/^(?:tt\d+|\d+)$/.test(id)) return [];
  const cacheKey = `${tipo}:${id}:${season}:${episode}`;
  const now = Date.now();
  const cached = saimoStreamCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.streams;

  const sources = await Promise.all((["dub", "leg"] as const).map(async (audio) => {
    try {
      const endpoint = new URL(STREAM_API);
      if (endpoint.protocol !== "https:") return [];
      endpoint.searchParams.set("tipo", tipo);
      endpoint.searchParams.set("id", id);
      endpoint.searchParams.set("versao", audio);
      if (tipo === "series") {
        endpoint.searchParams.set("temp", String(season));
        endpoint.searchParams.set("ep", String(episode));
      }
      const response = await fetch(endpoint, {
        redirect: "manual",
        signal: AbortSignal.timeout(5500),
        headers: { Accept: "application/json, video/*, application/vnd.apple.mpegurl, */*" },
      });
      let target: string | null = null;
      let playableInlineResponse = false;
      if (response.status >= 300 && response.status < 400) {
        target = response.headers.get("location");
      } else if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (/application\/json/i.test(contentType)) {
          const data = (await response.json()) as { url?: unknown };
          target = typeof data.url === "string" ? data.url : null;
        } else if (/^(video\/|audio\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl))/i.test(contentType)) {
          target = endpoint.toString();
          playableInlineResponse = true;
          await response.body?.cancel();
        }
      }
      if (!target) return [];
      const finalUrl = new URL(target, endpoint);
      if (!["http:", "https:"].includes(finalUrl.protocol)) return [];
      // Some Saimo mirrors send media with HTTP 200 instead of a 302;
      // those are still playable through our same-origin Range proxy.
      if (finalUrl.host === endpoint.host && finalUrl.pathname === endpoint.pathname &&
          !playableInlineResponse) return [];
      if (/^(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/i.test(finalUrl.hostname)) return [];
      // Mesmo caminho usado pela API pública, mas com entrega same-origin e Range/206.
      // URL direta fica disponível como fallback se o proxy não alcançar o CDN.
      return [
        {
          url: buildSaimoVodProxyUrl({ tipo, id, versao: audio, temp: season, ep: episode }),
          audio,
          name: `Zang Flix · Player principal (${audio.toUpperCase()})`,
          quality: "Auto",
          format: "auto" as const,
          priority: -10,
        },
        {
          url: finalUrl.toString(),
          audio,
          name: `Zang Flix · Link direto (${audio.toUpperCase()})`,
          quality: "Auto",
          format: isHlsUrl(finalUrl.toString()) ? "hls" as const : "auto" as const,
          priority: 0,
        },
      ];
    } catch {
      return [];
    }
  }));
  const streams: StreamSource[] = sources.flat();
  saimoStreamCache.set(cacheKey, {
    streams,
    expires: now + (streams.length ? STREAM_CACHE_TTL_MS : 60_000),
  });
  return streams;
}

export interface ResolveOptions {
  tipo: "movie" | "series";
  id?: string;
  tmdbId?: number | string | null;
  title?: string;
  season?: number;
  episode?: number;
}

/**
 * Resolve todas as fontes de reprodução de filmes e séries de alta qualidade
 */
export async function resolveVodStreams(opts: ResolveOptions): Promise<StreamSource[]> {
  const { tipo, season = 1, episode = 1, title = "" } = opts;
  const isSerie = tipo === "series";
  const rawId = String(opts.tmdbId || opts.id || "").trim();
  const cleanId = rawId.replace(/^(tmdb:|imdb:)/i, "");
  const cacheKey = `${tipo}:${cleanId || title}:${season}:${episode}`;
  const cached = streamResultsCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.streams;

  let resolvedTmdbId = /^\d+$/.test(cleanId) ? cleanId : "";
  if (!resolvedTmdbId && title) {
    try {
      const cleanTitle = title.replace(/^#+/, "").replace(/\s*\(\d{4}\)$/, "").trim();
      const searchRes = await fetch(
        `https://api.themoviedb.org/3/search/${isSerie ? "tv" : "movie"}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=pt-BR`,
        { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" }, signal: AbortSignal.timeout(2800) }
      );
      if (searchRes.ok) {
        const data = await searchRes.json() as { results?: Array<{ id: number }> };
        if (data.results?.[0]?.id) resolvedTmdbId = String(data.results[0].id);
      }
    } catch { /* A catalog title can still resolve independently. */ }
  }

  const lookup = resolvedTmdbId || cleanId;
  const jobs: Array<Promise<StreamSource[]>> = [];

  if (/^(?:[1-9]\d{0,11}|tt\d{4,12})$/.test(lookup)) {
    // Providers are independent. Never serially block a playable file while
    // waiting for an unavailable Redeflix, Fenix or Saimo endpoint.
    jobs.push(querySaimoOfficial(tipo, lookup, season, episode));

    jobs.push((async () => {
      const record = isSerie
        ? (await getRedeflixSeries()).get(lookup)?.episodes.get(`${season}:${episode}`)
        : (await getRedeflixFilmes()).get(lookup)?.streams;
      return record || [];
    })());

    jobs.push((async () => {
      const direct = await queryFenixFlix(isSerie, lookup, season, episode);
      if (direct.length || !/^\d+$/.test(lookup)) return direct;
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/${isSerie ? "tv" : "movie"}/${lookup}/external_ids?api_key=${TMDB_API_KEY}`,
          { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" }, signal: AbortSignal.timeout(2800) },
        );
        if (response.ok) {
          const data = await response.json() as { imdb_id?: string };
          if (data.imdb_id && /^tt\d+$/.test(data.imdb_id)) {
            return queryFenixFlix(isSerie, data.imdb_id, season, episode);
          }
        }
      } catch { /* Keep whatever other providers returned. */ }
      return [];
    })());
  }

  if (!isSerie && title) {
    jobs.push((async () => {
      const norm = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
      const first = norm[0]?.toUpperCase() || "#";
      const letter = /^[A-Z]$/.test(first) ? first : "%23";
      const [bases, catalog] = await Promise.all([
        getIndiceBases().catch(() => [] as string[]),
        fetchFirstText(catalogUrls(`filmes-${letter}.txt`), "filmes", { timeoutMs: 4800 })
          .then(result => result.text).catch(() => ""),
      ]);
      if (!catalog) return [];
      const comparable = (value: string) =>
        value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
          .replace(/^#+/, "").replace(/\s*\(\d{4}\)$/, "")
          .replace(/[^a-z0-9]/gi, "").toLowerCase();
      const wanted = comparable(title);
      const direct: StreamSource[] = [];
      for (const line of catalog.split("\n")) {
        const cols = line.split("\t");
        if (!cols[0] || comparable(cols[0]) !== wanted) continue;
        for (const field of cols.slice(1)) {
          const found = /^(dub|leg)=(.*)$/.exec(field.trim());
          if (!found) continue;
          const audio: AudioTrack = found[1] === "leg" ? "leg" : "dub";
          for (const token of (found[2] || "").split(",")) {
            const resolved = expandBaseToken(token.trim(), bases);
            if (!/^https?:\/\//i.test(resolved)) continue;
            direct.push({
              url: resolved, audio, format: isHlsUrl(resolved) ? "hls" : "auto",
              quality: detectVodQuality(resolved), priority: 2,
              name: `Catálogo (${audio.toUpperCase()})`,
            });
          }
        }
        break;
      }
      return direct;
    })());
  }

  const settled = await Promise.allSettled(jobs);
  const ordered: StreamSource[] = [];
  const seen = new Set<string>();
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    for (const source of outcome.value) {
      if (!source?.url || seen.has(source.url)) continue;
      seen.add(source.url);
      ordered.push(source);
    }
  }
  // Missing sources are never cached for hours. Retrying after a brief CDN
  // outage must not require the visitor to clear browser caches.
  streamResultsCache.set(cacheKey, {
    streams: ordered,
    expires: Date.now() + (ordered.length ? STREAM_CACHE_TTL_MS : 45_000),
  });
  if (streamResultsCache.size > 1500) streamResultsCache.clear();
  return ordered;
}

/**
 * Resolução do endpoint /api/stream padrão Saimo
 */
export async function resolveSingleStreamRedirect(
  opts: ResolveOptions & { versao?: "dub" | "leg" }
): Promise<string | null> {
  const sources = await resolveVodStreams(opts);
  if (sources.length === 0) return null;

  const targetAudio = opts.versao === "leg" ? "leg" : "dub";
  const matching = sources.filter((s) => s.audio === targetAudio);
  const chosen = (matching.length > 0 ? matching[0] : sources[0]).url;

  return chosen;
}
