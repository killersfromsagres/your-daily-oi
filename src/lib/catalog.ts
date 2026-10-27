import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AudioTrack,
  CatalogItem,
  HighlightItem,
  HighlightRow,
  StreamFormat,
  StreamSource,
  SeasonItem,
  EpisodeItem,
} from "./types";

// As URLs de catálogo:
const SAIMO_PAGES = (process.env.SAIMO_VOD_PAGES ?? "https://saimo-filmes.pages.dev").replace(/\/vod\/?$/i, "").replace(/\/$/, "");
const SAIMO_RAW = (process.env.SAIMO_VOD_RAW ?? "https://raw.githubusercontent.com/gabrielsaimo/SaimoPlayer/main/vod").replace(/\/$/, "");
const SNAPSHOT_URL = (process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "").replace(/\/$/, "");
const ANIMES_PAGES = (process.env.ANIMES_VOD_PAGES ?? "").replace(/\/$/, "");

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

/**
 * Remove formatações indesejadas como # no início e ano repetido no final (ex: '#Alive (2020)' -> 'Alive')
 */
export function cleanDisplayTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/^#+/, "")
    .replace(/\s*\(\d{4}\)$/, "")
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

const EMBEDDED_ANIMES_FICHAS = `a\tAttack on Titan\t1429\t/hTP1DtLGFamjfu8WqjnuQdP1n42.jpg\tAção,Animação,Fantasia,Shounen
a\tDemon Slayer\t85937\t/wrCVHknDaBW2usxOi7vgW9Q971o.jpg\tAnimação,Ação,Fantasia,Shounen
a\tOne Piece\t37854\t/e3NBmXv1m3pDk2z6R24g35YpS2c.jpg\tAção,Animação,Aventura,Shounen
a\tJujutsu Kaisen\t95479\t/hD8pZgqB8F5t3y0z9r1.jpg\tAnimação,Ação,Fantasia,Shounen
a\tSolo Leveling\t209867\t/geCRueV3ElhRTr0Q2x9URZLoxQP.jpg\tAção,Animação,Fantasia
a\tDragon Ball Z\t12971\t/7p40V9oXw4L1uTqSgB8a5.jpg\tAnimação,Ação,Ficção científica`;

export function isAnimeItem(item: CatalogItem | { type: string; title: string; genres: string[] }): boolean {
  if (item.type === "a") return true;
  if (item.genres && item.genres.some((g) => /anime|shounen|manga/i.test(g))) return true;
  const t = (item.title || "").toLowerCase();
  const animeKeywords = [
    "naruto", "dragon ball", "one piece", "bleach", "titan", "jujutsu", "demon slayer",
    "solo leveling", "death note", "hunter x hunter", "fullmetal", "chainsaw man",
    "hero academia", "boruto", "cavaleiros do zodiaco", "saint seiya", "pokemon",
    "digimon", "spy x family", "tokyo ghoul", "sword art online", "black clover",
    "fairy tail", "haikyuu", "evangelion", "akira", "kimetsu", "shingeki",
    "nanatsu no taizai", "overlord", "danmachi", "dr stone", "vinland", "frieren",
    "dandadan", "kaiju no 8", "blue lock", "mashle", "hells paradise"
  ];
  if (animeKeywords.some((k) => t.includes(k))) return true;
  if (item.genres && item.genres.includes("Animação") && item.type === "s") {
    return true;
  }
  return false;
}

async function fetchAnimeText(fileName: string): Promise<string> {
  if (ANIMES_PAGES) {
    try {
      const res = await fetchWithRetry(`${ANIMES_PAGES}/${fileName}`);
      if (res.ok) return await res.text();
    } catch {
      // fallback local
    }
  }
  try {
    const p = path.resolve(process.cwd(), "public", "animes", fileName);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8");
    }
  } catch {
    // fallback
  }
  if (fileName === "fichas.txt") return EMBEDDED_ANIMES_FICHAS;
  return "";
}

// Parse de fichas.txt: tipo\tTítulo\tTMDB_ID\tposter_path\tGênero1,Gênero2,...
function parseFichas(text: string): Map<string, Omit<CatalogItem, "streams" | "seasons">> {
  const map = new Map<string, Omit<CatalogItem, "streams" | "seasons">>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) continue;
    const parts = line.trim().split("\t");
    if (parts.length < 4) continue;
    const [tipo, title, tmdbRaw, posterPath, genresRaw] = parts;
    if (!title || (tipo !== "f" && tipo !== "s" && tipo !== "a")) continue;
    const tmdbId = tmdbRaw && !Number.isNaN(Number(tmdbRaw)) ? Number(tmdbRaw) : null;
    const genres = genresRaw ? genresRaw.split(",").map((g) => g.trim()).filter(Boolean) : [];
    const key = normalizeTitle(title);
    map.set(key, {
      id: key,
      type: tipo as "f" | "s" | "a",
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

// Cache de streams e temporadas por arquivo já baixado
const streamsCache = new Map<string, Map<string, StreamSource[]>>();
const seriesSeasonsCache = new Map<string, Map<string, SeasonItem[]>>();
let isBackgroundSyncing = false;

// Parse completo de series-{letra}-{n}.txt:
// @TítuloDaSérie
// temp\tep\tdub/leg\tURLs...
function parseSeriesData(text: string): {
  streams: Map<string, StreamSource[]>;
  seasons: Map<string, SeasonItem[]>;
} {
  const streamsMap = new Map<string, StreamSource[]>();
  const seasonsMap = new Map<string, Map<number, Map<number, EpisodeItem>>>();
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
    const [tempRaw, epRaw, audioRaw, urlsRaw] = parts;
    const seasonNumber = parseInt(tempRaw, 10) || 1;
    const episodeNumber = parseInt(epRaw, 10) || 1;
    const audio: AudioTrack = audioRaw?.toLowerCase() === "leg" ? "leg" : "dub";
    const streams = parseStreams(urlsRaw ?? "", audio);

    if (streams.length > 0) {
      // 1. Guarda em streams gerais
      const existingStreams = streamsMap.get(currentSeries) ?? [];
      existingStreams.push(...streams);
      streamsMap.set(currentSeries, existingStreams);

      // 2. Guarda em temporadas estruturadas
      if (!seasonsMap.has(currentSeries)) {
        seasonsMap.set(currentSeries, new Map<number, Map<number, EpisodeItem>>());
      }
      const seriesSeasons = seasonsMap.get(currentSeries)!;
      if (!seriesSeasons.has(seasonNumber)) {
        seriesSeasons.set(seasonNumber, new Map<number, EpisodeItem>());
      }
      const seasonEpisodes = seriesSeasons.get(seasonNumber)!;
      if (!seasonEpisodes.has(episodeNumber)) {
        seasonEpisodes.set(episodeNumber, {
          seasonNumber,
          episodeNumber,
          title: `Episódio ${episodeNumber}`,
          streams: [...streams],
        });
      } else {
        seasonEpisodes.get(episodeNumber)!.streams.push(...streams);
      }
    }
  }

  // Converte a estrutura aninhada para SeasonItem[]
  const finalSeasonsMap = new Map<string, SeasonItem[]>();
  for (const [seriesKey, seriesSeasons] of seasonsMap) {
    const seasonsList: SeasonItem[] = [];
    const sortedSeasonNumbers = Array.from(seriesSeasons.keys()).sort((a, b) => a - b);
    for (const sNum of sortedSeasonNumbers) {
      const epsMap = seriesSeasons.get(sNum)!;
      const sortedEpNumbers = Array.from(epsMap.keys()).sort((a, b) => a - b);
      const episodes = sortedEpNumbers.map((epNum) => epsMap.get(epNum)!);
      seasonsList.push({
        seasonNumber: sNum,
        episodes,
      });
    }
    finalSeasonsMap.set(seriesKey, seasonsList);
  }

  return { streams: streamsMap, seasons: finalSeasonsMap };
}

/**
 * Obtém a letra do arquivo a partir da inicial do título
 */
function getLetterKey(title: string): string {
  const norm = normalizeTitle(title);
  const first = norm[0] || "#";
  if (/[a-z]/i.test(first)) {
    return first.toUpperCase();
  }
  return "%23";
}

/**
 * Carrega streams e temporadas de uma letra específica de filme, série ou anime
 */
export async function getStreamsForLetter(type: "f" | "s" | "a", letter: string): Promise<Map<string, StreamSource[]>> {
  const cacheKey = `${type}-${letter}`;
  if (streamsCache.has(cacheKey)) {
    return streamsCache.get(cacheKey)!;
  }

  if (type === "a") {
    try {
      let text = await fetchAnimeText(`animes-${letter}-0.txt`);
      if (!text) {
        text = await fetchAnimeText(`animes-${letter}-1.txt`);
      }
      if (text) {
        const { streams, seasons } = parseSeriesData(text);
        streamsCache.set(cacheKey, streams);
        seriesSeasonsCache.set(`a-${letter}`, seasons);
        return streams;
      }
    } catch {
      // continua
    }
    const empty = new Map<string, StreamSource[]>();
    streamsCache.set(cacheKey, empty);
    return empty;
  }

  const fileName = type === "f" ? `filmes-${letter}.txt` : `series-${letter}-1.txt`;
  try {
    const text = await fetchText(getCatalogUrls(fileName));
    if (type === "f") {
      const parsed = parseFilmesFile(text);
      streamsCache.set(cacheKey, parsed);
      return parsed;
    } else {
      let combinedSeriesText = text;
      try {
        const textPart0 = await fetchText(getCatalogUrls(`series-${letter}-0.txt`));
        if (textPart0) combinedSeriesText = `${textPart0}\n${text}`;
      } catch {
        // continua com text principal
      }
      const { streams, seasons } = parseSeriesData(combinedSeriesText);
      streamsCache.set(cacheKey, streams);
      seriesSeasonsCache.set(letter, seasons);
      return streams;
    }
  } catch {
    const empty = new Map<string, StreamSource[]>();
    streamsCache.set(cacheKey, empty);
    return empty;
  }
}

/**
 * Busca temporadas e episódios de uma série ou anime de forma completa
 */
export async function getSeasonsForSeries(title: string, type: "s" | "a" = "s"): Promise<SeasonItem[]> {
  const norm = normalizeTitle(title);
  const letter = getLetterKey(title);
  const cacheMapKey = type === "a" ? `a-${letter}` : letter;
  if (!seriesSeasonsCache.has(cacheMapKey)) {
    await getStreamsForLetter(type, letter);
  }
  const seriesMap = seriesSeasonsCache.get(cacheMapKey);
  if (seriesMap?.has(norm)) {
    return seriesMap.get(norm)!;
  }
  return [];
}

/**
 * Busca streams de um título específico de forma cirúrgica e instantânea
 */
export async function getStreamsForItem(type: "f" | "s" | "a", title: string): Promise<StreamSource[]> {
  const norm = normalizeTitle(title);
  const letter = getLetterKey(title);
  const streamsMap = await getStreamsForLetter(type, letter);
  return streamsMap.get(norm) ?? [];
}

/**
 * Sincroniza em background todas as letras para pré-aquecer a busca sem travar a UI
 */
function syncAllStreamsInBackground() {
  if (isBackgroundSyncing) return;
  isBackgroundSyncing = true;
  const letters = ["%23", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  setTimeout(async () => {
    try {
      for (const l of letters) {
        await Promise.allSettled([
          getStreamsForLetter("f", l),
          getStreamsForLetter("s", l),
        ]);
      }
    } catch {
      // Ignora erro em segundo plano
    } finally {
      isBackgroundSyncing = false;
    }
  }, 100);
}

export async function loadCatalog(): Promise<{ items: Map<string, CatalogItem>; highlights: HighlightRow[] }> {
  const now = Date.now();
  if (catalogCache && highlightCache && now - cacheTime < CACHE_TTL) {
    return { items: catalogCache, highlights: highlightCache };
  }

  // Carrega fichas.txt, destaques.txt e animes em paralelo
  const [fichasText, destaquesText, animesFichasText] = await Promise.all([
    fetchText(getCatalogUrls("fichas.txt")),
    fetchText(getCatalogUrls("destaques.txt")),
    fetchAnimeText("fichas.txt").catch(() => ""),
  ]);

  const fichas = parseFichas(fichasText);
  const highlights = parseDestaques(destaquesText);

  // Funde as fichas de animes caso existam
  if (animesFichasText) {
    const animesFichas = parseFichas(animesFichasText);
    for (const [key, base] of animesFichas) {
      fichas.set(key, base);
    }

    // Se houver animes, adiciona a fileira "Animes em alta" aos destaques da Home
    const animeItems = Array.from(animesFichas.values());
    if (animeItems.length > 0) {
      highlights.unshift({
        rowName: "Animes em alta",
        items: animeItems.map((a) => ({
          type: "a" as const,
          title: a.title,
          letter: getLetterKey(a.title),
          year: "2024",
          posterPath: a.posterPath || "",
        })),
      });
    }
  }

  // Monta catálogo indexado
  const items = new Map<string, CatalogItem>();
  for (const [key, base] of fichas) {
    items.set(key, { ...base, streams: [] });
  }

  catalogCache = items;
  highlightCache = highlights;
  cacheTime = now;

  // Dispara aquecimento de streams em segundo plano sem travar a resposta HTTP
  syncAllStreamsInBackground();

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
