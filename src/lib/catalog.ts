import type {
  AudioTrack,
  CatalogItem,
  HighlightItem,
  HighlightRow,
  StreamFormat,
  StreamSource,
} from "./types";

// As URLs de catálogo:
// saimo-filmes.pages.dev já é a raiz de vod (sem prefixo /vod)
// github raw continua com o subdiretório /vod
const SAIMO_PAGES = (process.env.SAIMO_VOD_PAGES ?? "https://saimo-filmes.pages.dev").replace(/\/vod\/?$/i, "").replace(/\/$/, "");
const SAIMO_RAW = (process.env.SAIMO_VOD_RAW ?? "https://raw.githubusercontent.com/gabrielsaimo/SaimoPlayer/main/vod").replace(/\/$/, "");
const SNAPSHOT_URL = (process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "").replace(/\/$/, "");

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Cache em memória (renovado a cada 6h)
let catalogCache: Map<string, CatalogItem> | null = null;
let highlightCache: HighlightRow[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectFormat(url: string): StreamFormat {
  if (/\.m3u8(\?|$)/i.test(url) || /\.txt(\?|$)/i.test(url)) return "hls";
  if (/\.ts(\?|$)/i.test(url)) return "ts";
  // URLs de relay do Saimo (ex: https://saimo-tv.pages.dev/api/stream?...)
  if (/saimo-tv\.pages\.dev\/api\/stream/i.test(url)) return "mp4";
  return "mp4";
}

function isValidUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function parseStreams(raw: string, audio: AudioTrack): StreamSource[] {
  if (!raw) return [];
  const prefix = audio === "dub" ? "dub=" : "leg=";
  const part = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  return part
    .split(",")
    .map((url) => url.trim())
    .filter(isValidUrl)
    .map((url, i) => ({
      url,
      format: detectFormat(url),
      audio,
      priority: i,
    }));
}

/**
 * Fetch com retry, exponential backoff e cabeçalhos de navegador
 */
async function fetchWithRetry(url: string, maxRetries = 2): Promise<Response> {
  let attempt = 0;
  let delay = 500;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/plain, */*",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
      });
      if (res.ok) return res;
      if (res.status === 404) {
        throw new Error(`404 Not Found: ${url}`);
      }
    } catch (err) {
      if (attempt === maxRetries) throw err;
    }
    attempt++;
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
  throw new Error(`Falha ao conectar em ${url}`);
}

async function fetchText(urls: string[]): Promise<string> {
  for (const url of urls) {
    try {
      const res = await fetchWithRetry(url);
      if (res.ok) return await res.text();
    } catch {
      // Tenta próximo fallback
    }
  }
  throw new Error(`Falha ao buscar catálogo em todas as fontes: ${urls[0]}`);
}

/**
 * Monta as URLs de contingência:
 * 1. Snapshot próprio (se configurado)
 * 2. Espelho Cloudflare Pages (saimo-filmes.pages.dev/[arquivo]) - SEM /vod/
 * 3. Raw GitHub (raw.githubusercontent.com/.../vod/[arquivo]) - COM /vod/
 */
function getCatalogUrls(fileName: string): string[] {
  const urls: string[] = [];
  if (SNAPSHOT_URL) {
    urls.push(`${SNAPSHOT_URL}/${fileName}`);
  }
  // No Cloudflare Pages, a raiz JÁ É a pasta vod
  urls.push(`${SAIMO_PAGES}/${fileName}`);
  // No GitHub Raw, os arquivos estão dentro da pasta vod/
  urls.push(`${SAIMO_RAW}/${fileName}`);
  return urls;
}

// Parse de fichas.txt: tipo\tTítulo\tTMDB_ID\tposter_path\tGênero1,Gênero2,...
function parseFichas(text: string): Map<string, Omit<CatalogItem, "streams" | "seasons">> {
  const map = new Map<string, Omit<CatalogItem, "streams" | "seasons">>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) continue;
    const parts = line.trim().split("\t");
    if (parts.length < 4) continue;
    const [tipo, title, tmdbRaw, posterPath, genresRaw] = parts;
    if (!title || (tipo !== "f" && tipo !== "s")) continue;
    const tmdbId = tmdbRaw && !Number.isNaN(Number(tmdbRaw)) ? Number(tmdbRaw) : null;
    const genres = genresRaw ? genresRaw.split(",").map((g) => g.trim()).filter(Boolean) : [];
    const key = normalizeTitle(title);
    map.set(key, {
      id: key,
      type: tipo as "f" | "s",
      title: title.trim(),
      tmdbId,
      posterPath: posterPath?.trim() ?? "",
      posterUrl: posterPath ? `https://image.tmdb.org/t/p/w342${posterPath.trim()}` : "",
      genres,
      tmdb: null,
    });
  }
  return map;
}

// Parse de destaques.txt
function parseDestaques(text: string): HighlightRow[] {
  const rows = new Map<string, HighlightItem[]>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || line.startsWith("capa:")) continue;
    const parts = line.trim().split("\t");
    if (!parts[0]) continue;

    // Linha de fila: "fila\tNomeDaFileira"
    if (parts[0] === "fila" && parts[1]) {
      if (!rows.has(parts[1])) rows.set(parts[1], []);
      continue;
    }

    // Linha de item: "f\tTítulo\tLetra\tAno\tposter_path"
    const [tipo, title, letter, year, posterPath] = parts;
    if ((tipo === "f" || tipo === "s") && title) {
      const lastRow = Array.from(rows.keys()).at(-1);
      if (lastRow) {
        rows.get(lastRow)!.push({
          type: tipo as "f" | "s",
          title: title.trim(),
          letter: letter?.trim() ?? "",
          year: year?.trim() ?? "",
          posterPath: posterPath?.trim() ?? "",
        });
      }
    }
  }

  return Array.from(rows.entries()).map(([rowName, items]) => ({ rowName, items }));
}

// Parse de filmes-{letra}.txt: Título\tdub=URL1,URL2\tleg=URL1,...
function parseFilmesFile(text: string): Map<string, StreamSource[]> {
  const map = new Map<string, StreamSource[]>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) continue;
    const parts = line.trim().split("\t");
    if (parts.length < 2) continue;
    const [title, ...rest] = parts;
    if (!title) continue;
    const streams: StreamSource[] = [];
    for (const part of rest) {
      if (part.startsWith("dub=")) streams.push(...parseStreams(part, "dub"));
      else if (part.startsWith("leg=")) streams.push(...parseStreams(part, "leg"));
    }
    if (streams.length > 0) {
      map.set(normalizeTitle(title), streams);
    }
  }
  return map;
}

// Parse de series-{letra}-{n}.txt:
// @TítuloDaSérie
// temp\tep\tdub/leg\tURLs...
function parseSeriesEpisodesFile(text: string): Map<string, StreamSource[]> {
  const map = new Map<string, StreamSource[]>();
  let currentSeries = "";

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("@")) {
      const rawTitle = trimmed.slice(1).split("\t")[0]?.trim() ?? "";
      currentSeries = normalizeTitle(rawTitle);
      continue;
    }

    if (!currentSeries) continue;

    const parts = trimmed.split("\t");
    if (parts.length < 4) continue;
    const [, , audioRaw, urlsRaw] = parts;
    const audio: AudioTrack = audioRaw?.toLowerCase() === "leg" ? "leg" : "dub";
    const streams = parseStreams(urlsRaw ?? "", audio);

    if (streams.length > 0) {
      const existing = map.get(currentSeries) ?? [];
      existing.push(...streams);
      map.set(currentSeries, existing);
    }
  }

  return map;
}

export async function loadCatalog(): Promise<{ items: Map<string, CatalogItem>; highlights: HighlightRow[] }> {
  const now = Date.now();
  if (catalogCache && highlightCache && now - cacheTime < CACHE_TTL) {
    return { items: catalogCache, highlights: highlightCache };
  }

  // Carrega fichas.txt e destaques.txt em paralelo
  const [fichasText, destaquesText] = await Promise.all([
    fetchText(getCatalogUrls("fichas.txt")),
    fetchText(getCatalogUrls("destaques.txt")),
  ]);

  const fichas = parseFichas(fichasText);
  const highlights = parseDestaques(destaquesText);

  // Letras de A a Z + # (codificado para URL como %23)
  const letters = ["%23", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  // Busca streams de filmes e de séries em paralelo
  const [filmeResults, seriesResults] = await Promise.all([
    Promise.allSettled(
      letters.map((l) => fetchText(getCatalogUrls(`filmes-${l}.txt`)).then((t) => parseFilmesFile(t)))
    ),
    Promise.allSettled(
      letters.map((l) => fetchText(getCatalogUrls(`series-${l}-1.txt`)).then((t) => parseSeriesEpisodesFile(t)))
    ),
  ]);

  // Monta índice final
  const items = new Map<string, CatalogItem>();
  for (const [key, base] of fichas) {
    const streams: StreamSource[] = [];

    // Adiciona streams de filmes encontrados
    for (const result of filmeResults) {
      if (result.status === "fulfilled") {
        const found = result.value.get(key);
        if (found) streams.push(...found);
      }
    }

    // Adiciona streams de séries se for série
    for (const result of seriesResults) {
      if (result.status === "fulfilled") {
        const found = result.value.get(key);
        if (found) streams.push(...found);
      }
    }

    items.set(key, { ...base, streams });
  }

  catalogCache = items;
  highlightCache = highlights;
  cacheTime = now;

  return { items, highlights };
}

export function getGenres(items: Map<string, CatalogItem>): string[] {
  const counts = new Map<string, number>();
  for (const item of items.values()) {
    for (const g of item.genres) {
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);
}

export function searchItems(items: Map<string, CatalogItem>, query: string): CatalogItem[] {
  const q = normalizeTitle(query);
  if (!q) return Array.from(items.values());
  return Array.from(items.values()).filter((item) => normalizeTitle(item.title).includes(q));
}
