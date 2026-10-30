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

const FENIX_BASE = "https://fenixflix.fenixhub.online";
const CATALOG_BASE = "https://filmes-saimo.pages.dev";
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
    const res = await fetch(`${CATALOG_BASE}/indice.txt`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/plain, */*" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const text = await res.text();
      const bases: string[] = [];
      for (const line of text.split("\n")) {
        if (line.startsWith("base:")) {
          const parts = line.slice(5).trim().split(/\s+/);
          if (parts.length >= 2) {
            bases[Number(parts[0])] = parts.slice(1).join(" ");
          }
        }
      }
      basesCache = bases;
      basesCacheTime = now;
      return bases;
    }
  } catch (err) {
    console.warn("[SaimoStream] Falha ao obter indice.txt:", err);
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
  if (cached && cached.expires > now && cached.streams.length > 0) {
    return cached.streams;
  }

  const allSources: StreamSource[] = [];

  // 1. RedeFlix Direct Streams (embedplayer2.xyz, koyeb.app)
  if (cleanId) {
    if (isSerie) {
      const rfSeriesMap = await getRedeflixSeries();
      const rf = rfSeriesMap.get(cleanId);
      if (rf) {
        const epKey = `${season}:${episode}`;
        const streams = rf.episodes.get(epKey) || [];
        allSources.push(...streams);
      }
    } else {
      const rfFilmesMap = await getRedeflixFilmes();
      const rf = rfFilmesMap.get(cleanId);
      if (rf?.streams) {
        allSources.push(...rf.streams);
      }
    }
  }

  // 2. FenixFlix
  if (cleanId) {
    const fenixSources = await queryFenixFlix(isSerie, cleanId, season, episode);
    allSources.push(...fenixSources);

    // Se não achou streams e o ID é numérico (TMDB), tenta resolver IMDb ID via TMDB API
    if (allSources.length === 0 && /^\d+$/.test(cleanId)) {
      try {
        const extRes = await fetch(
          `https://api.themoviedb.org/3/${isSerie ? "tv" : "movie"}/${cleanId}/external_ids?api_key=${TMDB_API_KEY}`,
          { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" }, signal: AbortSignal.timeout(4000) }
        );
        if (extRes.ok) {
          const extData = (await extRes.json()) as { imdb_id?: string };
          if (extData?.imdb_id) {
            const fallbackSources = await queryFenixFlix(isSerie, extData.imdb_id, season, episode);
            allSources.push(...fallbackSources);
          }
        }
      } catch {}
    }
  }

  // 3. Fallback no Catálogo com expansão de bases do indice.txt
  if (title) {
    const bases = await getIndiceBases();
    const norm = title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const inicial = norm.charAt(0).toUpperCase();
    const letra = inicial >= "A" && inicial <= "Z" ? inicial : "#";

    try {
      if (!isSerie) {
        const fRes = await fetch(`${CATALOG_BASE}/filmes-${letra}.txt`, {
          headers: { "User-Agent": BROWSER_UA },
          signal: AbortSignal.timeout(5000),
        });
        if (fRes.ok) {
          const fTxt = await fRes.text();
          for (const line of fTxt.split("\n")) {
            const parts = line.split("\t");
            if (parts.length >= 2 && (parts[0] === title || parts[0].startsWith(title.split(" (")[0]))) {
              for (const p of parts.slice(1)) {
                const eq = p.indexOf("=");
                if (eq <= 0) continue;
                const audioKey = p.slice(0, eq).toLowerCase() === "leg" ? "leg" : "dub";
                const rawTokens = p.slice(eq + 1).split(",").filter(Boolean);
                for (const tok of rawTokens) {
                  if (tok.includes("api/stream")) continue;
                  const expanded = expandBaseToken(tok, bases);
                  if (expanded && expanded.startsWith("http")) {
                    allSources.push({
                      name: `Servidor Alternativo (${audioKey.toUpperCase()})`,
                      url: expanded,
                      audio: audioKey,
                      quality: "1080p",
                      format: isHlsUrl(expanded) ? "hls" : "mp4",
                      priority: 2,
                    });
                  }
                }
              }
              break;
            }
          }
        }
      }
    } catch {}
  }

  // Deduplicação estrita por URL preservando a prioridade
  const seenUrls = new Set<string>();
  const deduped: StreamSource[] = [];
  for (const s of allSources) {
    if (!s?.url || seenUrls.has(s.url)) continue;
    seenUrls.add(s.url);
    deduped.push(s);
  }

  if (deduped.length > 0) {
    streamResultsCache.set(cacheKey, {
      streams: deduped,
      expires: now + STREAM_CACHE_TTL_MS,
    });
  }

  return deduped;
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
