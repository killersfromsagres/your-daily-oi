import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type PlaylistSnapshot = {
  text: string;
  allowedHosts: Set<string>;
  expiresAt: number;
};

type MediaKind = "Filme" | "Série";

type EpisodeHint = {
  season: number | undefined;
  episode: number | undefined;
};

type ResolvePayload = {
  resolved: boolean;
  reason: string | undefined;
  message: string | undefined;
  tmdbId: number | undefined;
  imdbId: string | undefined;
  canonicalTitle: string | undefined;
  year: number | undefined;
  overview: string | undefined;
  posterPath: string | undefined;
  backdropPath: string | undefined;
  voteAverage: number | undefined;
  season: number | undefined;
  episode: number | undefined;
  trailerUrl: string | undefined;
  embedUrl: string | undefined;
  providerConfigured: boolean;
};

type TmdbSearchItem = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_count?: number;
};

type TmdbSearchResponse = {
  results?: TmdbSearchItem[];
};

type TmdbVideo = {
  key?: string;
  site?: string;
  type?: string;
  official?: boolean;
};

type TmdbDetails = {
  id?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  imdb_id?: string;
  external_ids?: { imdb_id?: string };
  videos?: { results?: TmdbVideo[] };
};

type ResolveCacheEntry = {
  expiresAt: number;
  payload: ResolvePayload;
};

const ZANG_PLAYLIST_SOURCE =
  "https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/refs/heads/master/Filmes-Series.m3u8";
const ZANG_PLAYLIST_PATH = "/api/zang-playlist";
const ZANG_STREAM_PREFIX = "/api/zang-stream";
const ZANG_RESOLVE_PATH = "/api/zang-resolve";
const PLAYLIST_CACHE_MS = 5 * 60 * 1000;
const RESOLVE_CACHE_MS = 24 * 60 * 60 * 1000;
const RESOLVE_NEGATIVE_CACHE_MS = 60 * 60 * 1000;
const MAX_REDIRECTS = 4;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let serverEntryPromise: Promise<ServerEntry> | undefined;
let playlistSnapshot: PlaylistSnapshot | undefined;
let playlistSnapshotPromise: Promise<PlaylistSnapshot> | undefined;
const resolveCache = new Map<string, ResolveCacheEntry>();

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function jsonResponse(payload: unknown, status = 200, cacheControl = "no-store"): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

function envValue(name: string): string {
  if (typeof process === "undefined") return "";
  return process.env[name]?.trim() ?? "";
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a = 0, b = 0] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (!host.includes(".") && !host.includes(":")) return true;
  if (isPrivateIpv4(host)) return true;

  const compactIpv6 = host.replace(/^::ffff:/, "");
  if (compactIpv6 === "::1" || compactIpv6 === "::") return true;
  if (/^(fc|fd)/i.test(compactIpv6)) return true;
  if (/^fe[89ab]/i.test(compactIpv6)) return true;
  return false;
}

function isSafeHttpUrl(url: URL): boolean {
  return (url.protocol === "http:" || url.protocol === "https:") && !isBlockedHostname(url.hostname);
}

function proxyPathFor(source: URL): string {
  const extensionMatch = source.pathname.match(/\.([a-z0-9]{2,5})$/i);
  const extension = extensionMatch?.[1]?.toLowerCase();
  const safeExtension = extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : "stream";
  return `${ZANG_STREAM_PREFIX}/media.${safeExtension}?src=${encodeURIComponent(source.toString())}`;
}

function resolveSafeUrl(value: string, base: string): URL | null {
  try {
    const resolved = new URL(value, base);
    return isSafeHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function collectAllowedHosts(text: string): Set<string> {
  const hosts = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const url = resolveSafeUrl(line, ZANG_PLAYLIST_SOURCE);
    if (url) hosts.add(url.hostname.toLowerCase());
  }
  return hosts;
}

async function loadPlaylistSnapshot(): Promise<PlaylistSnapshot> {
  const now = Date.now();
  if (playlistSnapshot && playlistSnapshot.expiresAt > now) return playlistSnapshot;
  if (playlistSnapshotPromise) return playlistSnapshotPromise;

  playlistSnapshotPromise = (async () => {
    const response = await fetch(ZANG_PLAYLIST_SOURCE, {
      headers: { accept: "application/vnd.apple.mpegurl,text/plain;q=0.9,*/*;q=0.8" },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Playlist upstream respondeu ${response.status}`);
    }
    const text = await response.text();
    const snapshot: PlaylistSnapshot = {
      text,
      allowedHosts: collectAllowedHosts(text),
      expiresAt: Date.now() + PLAYLIST_CACHE_MS,
    };
    playlistSnapshot = snapshot;
    return snapshot;
  })();

  try {
    return await playlistSnapshotPromise;
  } finally {
    playlistSnapshotPromise = undefined;
  }
}

function rewriteCatalogPlaylist(text: string): string {
  return text
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return rawLine;
      const source = resolveSafeUrl(line, ZANG_PLAYLIST_SOURCE);
      return source ? proxyPathFor(source) : rawLine;
    })
    .join("\n");
}

function rewriteHlsManifest(text: string, baseUrl: string, allowedHosts: Set<string>): string {
  const rewriteUri = (rawValue: string): string => {
    const resolved = resolveSafeUrl(rawValue, baseUrl);
    if (!resolved) return rawValue;
    if (!allowedHosts.has(resolved.hostname.toLowerCase())) return resolved.toString();
    return proxyPathFor(resolved);
  };

  return text
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return rawLine;
      if (line.startsWith("#")) {
        return rawLine.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewriteUri(uri)}"`);
      }
      return rewriteUri(line);
    })
    .join("\n");
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function buildUpstreamHeaders(request: Request, target: URL): Headers {
  const headers = new Headers();
  const range = request.headers.get("range");
  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");
  const accept = request.headers.get("accept");

  headers.set("accept", accept || "*/*");
  headers.set("accept-language", "pt-BR,pt;q=0.9,en;q=0.7");
  headers.set("referer", `${target.protocol}//${target.host}/`);
  headers.set("origin", `${target.protocol}//${target.host}`);
  headers.set("user-agent", BROWSER_USER_AGENT);
  if (range) headers.set("range", range);
  if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);
  if (ifModifiedSince) headers.set("if-modified-since", ifModifiedSince);
  return headers;
}

async function fetchStreamUpstream(
  request: Request,
  initialUrl: URL,
  allowedHosts: Set<string>,
): Promise<{ response: Response; finalUrl: URL }> {
  let target = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!isSafeHttpUrl(target) || !allowedHosts.has(target.hostname.toLowerCase())) {
      throw new Error("Destino de stream não autorizado");
    }

    const response = await fetch(target, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: buildUpstreamHeaders(request, target),
      redirect: "manual",
    });

    if (!isRedirectStatus(response.status)) return { response, finalUrl: target };
    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: target };
    const next = resolveSafeUrl(location, target.toString());
    if (!next) throw new Error("Redirecionamento de stream inválido");
    target = next;
  }

  throw new Error("Muitos redirecionamentos no stream");
}

function copyMediaHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("access-control-allow-origin", "*");
  headers.set("cross-origin-resource-policy", "cross-origin");
  return headers;
}

async function handleZangPlaylist(): Promise<Response> {
  try {
    const snapshot = await loadPlaylistSnapshot();
    return new Response(rewriteCatalogPlaylist(snapshot.text), {
      status: 200,
      headers: {
        "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
        "cache-control": "public, max-age=120, stale-while-revalidate=300",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    console.error("Zang playlist gateway:", error);
    return new Response("Não foi possível carregar a playlist do Zang Flix.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function handleZangStream(request: Request, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Método não permitido", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const rawSource = url.searchParams.get("src");
  if (!rawSource) return new Response("Stream sem origem", { status: 400 });

  let source: URL;
  try {
    source = new URL(rawSource);
  } catch {
    return new Response("Origem de stream inválida", { status: 400 });
  }

  try {
    const snapshot = await loadPlaylistSnapshot();
    if (!isSafeHttpUrl(source) || !snapshot.allowedHosts.has(source.hostname.toLowerCase())) {
      return new Response("Origem de stream não autorizada", { status: 403 });
    }

    const { response: upstream, finalUrl } = await fetchStreamUpstream(
      request,
      source,
      snapshot.allowedHosts,
    );

    const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
    const isManifest =
      /\.m3u8(?:$|\?)/i.test(finalUrl.toString()) ||
      contentType.includes("mpegurl") ||
      contentType.includes("vnd.apple.mpegurl");

    if (request.method === "GET" && isManifest && upstream.ok) {
      const manifest = await upstream.text();
      const rewritten = rewriteHlsManifest(manifest, finalUrl.toString(), snapshot.allowedHosts);
      return new Response(rewritten, {
        status: upstream.status,
        headers: {
          "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
          "cache-control": upstream.headers.get("cache-control") || "no-cache",
          "access-control-allow-origin": "*",
          "cross-origin-resource-policy": "cross-origin",
        },
      });
    }

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: copyMediaHeaders(upstream),
    });
  } catch (error) {
    console.error("Zang stream gateway:", error);
    return new Response("O servidor de origem do vídeo não respondeu.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

function parseEpisodeHint(title: string): EpisodeHint {
  const patterns = [
    /\bS(\d{1,2})\s*E(\d{1,3})\b/i,
    /\b(\d{1,2})\s*x\s*(\d{1,3})\b/i,
    /\bT(?:EMPORADA)?\s*(\d{1,2})\s*[-_. ]*E(?:P(?:IS[ÓO]DIO)?)?\s*(\d{1,3})\b/i,
    /\bTEMPORADA\s*(\d{1,2}).*?EPIS[ÓO]DIO\s*(\d{1,3})\b/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (!match) continue;
    const season = Number(match[1]);
    const episode = Number(match[2]);
    if (Number.isFinite(season) && Number.isFinite(episode)) return { season, episode };
  }
  return { season: undefined, episode: undefined };
}

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSearchTitle(title: string): string {
  return title
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, " ")
    .replace(/\bT(?:EMPORADA)?\s*\d{1,2}\s*[-_. ]*E(?:P(?:IS[ÓO]DIO)?)?\s*\d{1,3}\b/gi, " ")
    .replace(/\bTEMPORADA\s*\d{1,2}\b/gi, " ")
    .replace(/\bEP(?:IS[ÓO]DIO)?\s*\d{1,3}\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(4K|2160P|1080P|720P|480P|UHD|FHD|HD|HDR10?|DV|DOLBY\s*VISION|WEB[- ]?DL|WEBRIP|BLU[- ]?RAY|BDRIP|HEVC|X26[45]|H\.?26[45]|DUBLADO|LEGENDADO|DUAL\s*AUDIO|PT[- ]?BR|PORTUGU[EÊ]S|NACIONAL)\b/gi, " ")
    .replace(/[|_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-–—:;.\s]+|[-–—:;.\s]+$/g, "")
    .trim();
}

function titleTokens(value: string): Set<string> {
  return new Set(foldText(value).split(/\s+/).filter((token) => token.length > 1));
}

function titleSimilarity(a: string, b: string): number {
  const left = foldText(a);
  const right = foldText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;

  const aTokens = titleTokens(left);
  const bTokens = titleTokens(right);
  if (!aTokens.size || !bTokens.size) return 0;
  let intersection = 0;
  for (const token of aTokens) if (bTokens.has(token)) intersection += 1;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
}

function resultYear(item: TmdbSearchItem): number | undefined {
  const date = item.release_date || item.first_air_date;
  const year = date?.slice(0, 4);
  if (!year) return undefined;
  const parsed = Number(year);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function scoreSearchResult(item: TmdbSearchItem, query: string, year: number | undefined): number {
  const candidate = item.title || item.name || item.original_title || item.original_name || "";
  let score = titleSimilarity(query, candidate) * 100;
  const candidateYear = resultYear(item);
  if (year && candidateYear) {
    const distance = Math.abs(year - candidateYear);
    if (distance === 0) score += 26;
    else if (distance === 1) score += 12;
    else if (distance > 3) score -= 18;
  }
  score += Math.min(8, Math.log10(Math.max(1, item.vote_count ?? 0)) * 2);
  score += Math.min(4, Math.log10(Math.max(1, item.popularity ?? 0)));
  return score;
}

async function tmdbFetchJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(`TMDB respondeu ${response.status}`);
  return (await response.json()) as T;
}

function pickTrailer(videos: TmdbVideo[] | undefined): string | undefined {
  const youtube = (videos ?? []).filter((video) => video.site === "YouTube" && Boolean(video.key));
  const selected =
    youtube.find((video) => video.official && video.type === "Trailer") ??
    youtube.find((video) => video.type === "Trailer") ??
    youtube.find((video) => video.official) ??
    youtube[0];
  return selected?.key
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(selected.key)}?autoplay=1&rel=0`
    : undefined;
}

function replaceTemplate(template: string, values: Record<string, string>): string | undefined {
  if (!template) return undefined;
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  if (/\{[a-z_]+}/i.test(output)) return undefined;
  try {
    const url = new URL(output);
    return isSafeHttpUrl(url) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function buildConfiguredEmbed(
  kind: MediaKind,
  tmdbId: number,
  imdbId: string | undefined,
  episode: EpisodeHint,
): { embedUrl: string | undefined; providerConfigured: boolean } {
  const templates = {
    movieTmdb: envValue("ZANG_EMBED_MOVIE_TMDB_TEMPLATE"),
    movieImdb: envValue("ZANG_EMBED_MOVIE_IMDB_TEMPLATE"),
    seriesTmdb: envValue("ZANG_EMBED_SERIES_TMDB_TEMPLATE"),
    seriesImdb: envValue("ZANG_EMBED_SERIES_IMDB_TEMPLATE"),
    seriesRootTmdb: envValue("ZANG_EMBED_SERIES_ROOT_TMDB_TEMPLATE"),
  };
  const providerConfigured = Object.values(templates).some(Boolean);
  const values: Record<string, string> = {
    tmdb_id: String(tmdbId),
    season: episode.season ? String(episode.season) : "",
    episode: episode.episode ? String(episode.episode) : "",
    season_number: episode.season ? String(episode.season) : "",
    episode_number: episode.episode ? String(episode.episode) : "",
  };
  if (imdbId) values.imdb_id = imdbId;

  if (kind === "Filme") {
    return {
      providerConfigured,
      embedUrl:
        replaceTemplate(templates.movieTmdb, values) ??
        (imdbId ? replaceTemplate(templates.movieImdb, values) : undefined),
    };
  }

  const hasEpisode = Boolean(episode.season && episode.episode);
  return {
    providerConfigured,
    embedUrl: hasEpisode
      ? replaceTemplate(templates.seriesTmdb, values) ??
        (imdbId ? replaceTemplate(templates.seriesImdb, values) : undefined)
      : replaceTemplate(templates.seriesRootTmdb, values),
  };
}

async function resolveWithTmdb(
  originalTitle: string,
  kind: MediaKind,
  requestedYear: number | undefined,
): Promise<ResolvePayload> {
  const token = envValue("TMDB_API_TOKEN");
  const episodeHint = parseEpisodeHint(originalTitle);
  const query = normalizeSearchTitle(originalTitle);
  const yearFromTitle = originalTitle.match(/\b(19|20)\d{2}\b/)?.[0];
  const titleYear = yearFromTitle ? Number(yearFromTitle) : undefined;
  const year = requestedYear ?? titleYear;

  if (!token) {
    return {
      resolved: false,
      reason: "tmdb_not_configured",
      message: "TMDB_API_TOKEN não está configurado no servidor.",
      tmdbId: undefined,
      imdbId: undefined,
      canonicalTitle: query || originalTitle,
      year,
      overview: undefined,
      posterPath: undefined,
      backdropPath: undefined,
      voteAverage: undefined,
      season: episodeHint.season,
      episode: episodeHint.episode,
      trailerUrl: undefined,
      embedUrl: undefined,
      providerConfigured: false,
    };
  }

  if (!query) {
    return {
      resolved: false,
      reason: "invalid_title",
      message: "Não foi possível extrair um título pesquisável.",
      tmdbId: undefined,
      imdbId: undefined,
      canonicalTitle: originalTitle,
      year,
      overview: undefined,
      posterPath: undefined,
      backdropPath: undefined,
      voteAverage: undefined,
      season: episodeHint.season,
      episode: episodeHint.episode,
      trailerUrl: undefined,
      embedUrl: undefined,
      providerConfigured: false,
    };
  }

  const queryParams = new URLSearchParams({
    query,
    language: "pt-BR",
    include_adult: "false",
    page: "1",
  });
  if (year) queryParams.set(kind === "Filme" ? "year" : "first_air_date_year", String(year));

  const searchPath = kind === "Filme" ? "/search/movie" : "/search/tv";
  const search = await tmdbFetchJson<TmdbSearchResponse>(`${searchPath}?${queryParams.toString()}`, token);
  const ranked = [...(search.results ?? [])].sort(
    (a, b) => scoreSearchResult(b, query, year) - scoreSearchResult(a, query, year),
  );
  const best = ranked[0];

  if (!best || scoreSearchResult(best, query, year) < 48) {
    return {
      resolved: false,
      reason: "tmdb_not_found",
      message: `Nenhum resultado confiável encontrado no TMDB para “${query}”.`,
      tmdbId: undefined,
      imdbId: undefined,
      canonicalTitle: query,
      year,
      overview: undefined,
      posterPath: undefined,
      backdropPath: undefined,
      voteAverage: undefined,
      season: episodeHint.season,
      episode: episodeHint.episode,
      trailerUrl: undefined,
      embedUrl: undefined,
      providerConfigured: false,
    };
  }

  const mediaPath = kind === "Filme" ? `/movie/${best.id}` : `/tv/${best.id}`;
  const details = await tmdbFetchJson<TmdbDetails>(
    `${mediaPath}?language=pt-BR&append_to_response=external_ids,videos`,
    token,
  );

  let trailerUrl = pickTrailer(details.videos?.results);
  if (!trailerUrl) {
    try {
      const englishVideos = await tmdbFetchJson<{ results?: TmdbVideo[] }>(
        `${mediaPath}/videos?language=en-US`,
        token,
      );
      trailerUrl = pickTrailer(englishVideos.results);
    } catch {
      // Trailer é um fallback opcional.
    }
  }

  const imdbId = details.external_ids?.imdb_id || details.imdb_id;
  const configured = buildConfiguredEmbed(kind, best.id, imdbId, episodeHint);
  const canonicalTitle = details.title || details.name || best.title || best.name || query;
  const detailDate = details.release_date || details.first_air_date;
  const detailYear = detailDate ? Number(detailDate.slice(0, 4)) : year;

  return {
    resolved: true,
    reason: undefined,
    message: configured.embedUrl
      ? "Título resolvido e fonte configurada."
      : trailerUrl
        ? "Título resolvido; usando trailer oficial como fallback."
        : "Título resolvido, mas nenhuma fonte autorizada foi configurada.",
    tmdbId: best.id,
    imdbId,
    canonicalTitle,
    year: Number.isFinite(detailYear) ? detailYear : undefined,
    overview: details.overview,
    posterPath: details.poster_path
      ? `https://image.tmdb.org/t/p/w780${details.poster_path}`
      : undefined,
    backdropPath: details.backdrop_path
      ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
      : undefined,
    voteAverage: details.vote_average,
    season: episodeHint.season,
    episode: episodeHint.episode,
    trailerUrl,
    embedUrl: configured.embedUrl,
    providerConfigured: configured.providerConfigured,
  };
}

async function handleZangResolve(url: URL): Promise<Response> {
  const title = url.searchParams.get("title")?.trim() ?? "";
  const kind: MediaKind = /s[ée]rie/i.test(url.searchParams.get("kind") ?? "") ? "Série" : "Filme";
  const rawYear = url.searchParams.get("year");
  const year = rawYear && /^\d{4}$/.test(rawYear) ? Number(rawYear) : undefined;

  if (!title) return jsonResponse({ message: "Título obrigatório." }, 400);
  if (title.length > 240) return jsonResponse({ message: "Título muito longo." }, 400);

  const cacheKey = `${kind}|${title}|${year ?? ""}`.toLowerCase();
  const cached = resolveCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return jsonResponse(cached.payload, 200, "private, max-age=300");
  }

  try {
    const payload = await resolveWithTmdb(title, kind, year);
    resolveCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + (payload.resolved ? RESOLVE_CACHE_MS : RESOLVE_NEGATIVE_CACHE_MS),
    });
    return jsonResponse(payload, 200, "private, max-age=300");
  } catch (error) {
    console.error("Zang TMDB resolver:", error);
    return jsonResponse(
      {
        resolved: false,
        reason: "tmdb_error",
        message: error instanceof Error ? error.message : "Falha ao consultar o TMDB.",
        providerConfigured: false,
      },
      502,
    );
  }
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
      if (url.pathname === ZANG_PLAYLIST_PATH) return await handleZangPlaylist();
      if (url.pathname === ZANG_RESOLVE_PATH) return await handleZangResolve(url);
      if (url.pathname.startsWith(`${ZANG_STREAM_PREFIX}/`)) {
        return await handleZangStream(request, url);
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
