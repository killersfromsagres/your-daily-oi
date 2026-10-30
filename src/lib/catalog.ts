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
import { getIndiceBases, expandBaseToken, isHlsUrl } from "./saimo-stream";

// As URLs de catálogo:
const SAIMO_PAGES = (process.env.SAIMO_VOD_PAGES ?? "https://filmes-saimo.pages.dev").replace(/\/vod\/?$/i, "").replace(/\/$/, "");
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
  if (isHlsUrl(url)) return "hls";
  if (/\.ts(\?|$)/i.test(url)) return "ts";
  return "mp4";
}

function isValidUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Detecta a qualidade/resolução real de um stream a partir da URL e/ou metadados
 */
export function detectQuality(url: string, title?: string): string {
  const target = `${url} ${title || ""}`.toLowerCase();
  if (target.includes("4k") || target.includes("2160") || target.includes("uhd")) {
    return "4K";
  }
  if (target.includes("2k") || target.includes("1440") || target.includes("qhd")) {
    return "2K";
  }
  if (target.includes("1080") || target.includes("fhd") || target.includes("fullhd") || target.includes("1080p")) {
    return "1080p";
  }
  if (target.includes("720") || target.includes("720p") || target.includes("hd")) {
    return "720p";
  }
  if (target.includes("480") || target.includes("480p") || target.includes("sd")) {
    return "480p";
  }
  return "1080p";
}

function parseStreams(raw: string, audio: AudioTrack, bases: string[] = []): StreamSource[] {
  if (!raw) return [];
  const prefix = audio === "dub" ? "dub=" : "leg=";
  const part = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  return part
    .split(",")
    .map((tok) => tok.trim())
    .map((tok) => (bases.length > 0 ? expandBaseToken(tok, bases) : tok))
    .filter(isValidUrl)
    .filter((url) => !url.includes("r2.dev") && !url.includes("desativado.invalid"))
    .map((rawUrl, i) => {
      // Atualiza cdn.hermesnewone para https (evita bloqueio de mixed-content e Cloudflare challenge)
      const url = rawUrl.replace(/^http:\/\/cdn\.hermesnewone\.com/i, "https://cdn.hermesnewone.com");
      return {
        url,
        format: detectFormat(url),
        audio,
        priority: i + 2,
        quality: detectQuality(url),
      };
    });
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

const EMBEDDED_ANIMES_FICHAS = `a\tAttack on Titan\t1429\t/8aMqmB5xSblsZc7bLMEhE28yHa2.jpg\tAnimação,Ação,Fantasia,Shounen
a\tDemon Slayer: Kimetsu no Yaiba\t85937\t/7Uj6vqmznWQ3w3hpQ1eIY9mMyMw.jpg\tAnimação,Ação,Fantasia,Shounen
a\tOne Piece\t111110\t/aesLt9fsKSA6KCgGxA60VVxjtLk.jpg\tAnimação,Ação,Aventura,Shounen
a\tJujutsu Kaisen\t95479\t/8R1mMSC1gX1cg5ed7ns49JOEqw3.jpg\tAnimação,Ação,Fantasia,Shounen
a\tSolo Leveling\t127532\t/eCD7WS9h4lCT8N4Xavc9u8R1IGk.jpg\tAnimação,Ação,Fantasia,Aventura
a\tDragon Ball Z\t12971\t/kbkuYkaFsDwL6cyMgnBf77LczEo.jpg\tAnimação,Ação,Ficção científica,Shounen
a\tNaruto Shippuden\t31910\t/nRJmByfK9XdtOY73VArcN8KpKVs.jpg\tAnimação,Ação,Aventura,Shounen
a\tDeath Note\t13916\t/iigTJJskR1PcjjXqxdyJwVB3BoU.jpg\tAnimação,Mistério,Drama,Sobrenatural
a\tHunter x Hunter\t46298\t/9WxfAQquTun9ATkV6iAeFHMkqxv.jpg\tAnimação,Ação,Aventura,Shounen
a\tBleach\t30984\t/dx28DE7EgLy0FatOvnaUg0k9j92.jpg\tAnimação,Ação,Sobrenatural,Shounen
a\tChainsaw Man\t114410\t/mIz0eKhzHuSPeRSePCyoCt9bKVp.jpg\tAnimação,Ação,Sobrenatural,Shounen
a\tFullmetal Alchemist: Brotherhood\t31911\t/vIkH7fUQf8Olo8Apq56FQLGDXOo.jpg\tAnimação,Ação,Aventura,Fantasia
a\tSpy x Family\t120089\t/vaIREdPGZOnW9Jrs86mheVVlIQQ.jpg\tAnimação,Comédia,Ação
a\tMy Hero Academia\t280110\t/3INu3n1sUa9K3O5OTPrqvJOetbd.jpg\tAnimação,Ação,Ficção científica,Shounen
a\tTokyo Ghoul\t61374\t/5XBk7T4NsGeN9RG39y2nU6gRWQl.jpg\tAnimação,Ação,Terror,Sobrenatural
a\tFrieren\t209867\t/qykTIEJQF8cunKD0CKOqab15wns.jpg\tAnimação,Aventura,Drama,Fantasia
a\tNamakura Gatana\t208624\t/8oE3piDBG6ZYyUnKurantSmpE4o.jpg\tAnimação,Comédia,História,Domínio Público
a\tMomotaro e as Águias do Mar\t118689\t/4eXmjmYBHInHjHaijObMz2Qfwl8.jpg\tAnimação,Fantasia
a\tA Aranha e a Tulipa\t324443\t/lsodRXxiLqjQwxegBeSEaHLAXGi.jpg\tAnimação,Aventura
a\tUgokie Kori no Tatehiki\t319146\thttps://archive.org/services/img/ugokie-kori-no-tatehiki-1933\tAnimação,Fantasia,Comédia
a\tBenkei tai Ushiwaka\t345817\thttps://archive.org/services/img/benkei-tai-ushiwaka-1939\tAção,Animação,Comédia`;

// Episódios de animes embutidos diretamente no bundle para funcionamento em produção serverless (zero fs)
const EMBEDDED_ANIMES_EPISODES: Record<string, string> = {
  "animes-A-0.txt": `@Attack on Titan\t2013
1\t1\tdub\thttps://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=1&ep=1&versao=dub,https://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=1&ep=1&versao=leg
1\t2\tdub\thttps://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=1&ep=2&versao=dub,https://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=1&ep=2&versao=leg
1\t3\tdub\thttps://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=1&ep=3&versao=dub,https://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=1&ep=3&versao=leg
2\t1\tdub\thttps://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=2&ep=1&versao=dub,https://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=2&ep=1&versao=leg
2\t2\tdub\thttps://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=2&ep=2&versao=dub,https://saimo-tv.pages.dev/api/stream?tipo=series&id=1429&temp=2&ep=2&versao=leg

@A Aranha e a Tulipa\t1943
1\t1\tleg\thttps://archive.org/download/kumo-to-churippu-1943/Kumo%20to%20ch%C3%BBrippu%20(1943).mp4
`,
  "animes-B-0.txt": `@Benkei tai Ushiwaka\t1939
1\t1\tleg\thttps://archive.org/download/benkei-tai-ushiwaka-1939/Benkei%20tai%20Ushiwaka%20(1939).mp4
`,
  "animes-D-0.txt": `@Demon Slayer: Kimetsu no Yaiba\t2019
1\t1\tdub\thttps://saimo-tv.pages.dev/api/stream?tipo=series&id=85937&temp=1&ep=1&versao=dub,https://saimo-tv.pages.dev/api/stream?tipo=series&id=85937&temp=1&ep=1&versao=leg
1\t2\tdub\thttps://saimo-tv.pages.dev/api/stream?tipo=series&id=85937&temp=1&ep=2&versao=dub,https://saimo-tv.pages.dev/api/stream?tipo=series&id=85937&temp=1&ep=2&versao=leg
`,
  "animes-M-0.txt": `@Momotaro e as Águias do Mar\t1943
1\t1\tleg\thttps://archive.org/download/momotaro-no-umiwashi-1943/Momotaro%20no%20umiwashi%20(1943).mp4
`,
  "animes-N-0.txt": `@Namakura Gatana\t1917
1\t1\tleg\thttps://archive.org/download/failedsamurai1917krazytoonsprint/failedsamurai1917krazytoonsprint.mp4
`,
  "animes-U-0.txt": `@Ugokie Kori no Tatehiki\t1933
1\t1\tleg\thttps://archive.org/download/ugokie-kori-no-tatehiki-1933/Ugokie%20kori%20no%20tatehiki%20(1933).mp4
`,
};

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
  if (fileName === "fichas.txt") return EMBEDDED_ANIMES_FICHAS;
  if (EMBEDDED_ANIMES_EPISODES[fileName]) {
    return EMBEDDED_ANIMES_EPISODES[fileName];
  }
  if (ANIMES_PAGES) {
    try {
      const res = await fetchWithRetry(`${ANIMES_PAGES}/${fileName}`);
      if (res.ok) return await res.text();
    } catch {
      // fallback
    }
  }
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
    const normKey = normalizeTitle(title);
    const cleanPoster = posterPath?.trim() ?? "";
    const posterUrl = cleanPoster
      ? cleanPoster.startsWith("http")
        ? cleanPoster
        : `https://image.tmdb.org/t/p/w500${cleanPoster.startsWith("/") ? "" : "/"}${cleanPoster}`
      : "";

    // Se já houver um item cadastrado com o mesmo título mas tipo diferente (ex: Duna filme vs Duna série),
    // cria um ID único para o novo e preserva ambos no catálogo
    let id = normKey;
    if (map.has(normKey) && map.get(normKey)!.type !== tipo) {
      id = `${normKey}-${tipo === "f" ? "filme" : tipo === "s" ? "serie" : "anime"}`;
    }

    const itemObj = {
      id,
      type: tipo as "f" | "s" | "a",
      title: title.trim(),
      tmdbId,
      posterPath: cleanPoster,
      posterUrl,
      genres,
      tmdb: null,
    };

    map.set(id, itemObj);
    // Registra chave com prefixo de tipo para resolução cirúrgica (ex: "f-duna" e "s-duna")
    map.set(`${tipo}-${normKey}`, itemObj);
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
function parseFilmesFile(text: string, bases: string[] = []): Map<string, StreamSource[]> {
  const map = new Map<string, StreamSource[]>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#")) continue;
    const parts = line.trim().split("\t");
    if (parts.length < 2) continue;
    const [title, ...rest] = parts;
    if (!title) continue;
    const streams: StreamSource[] = [];
    for (const part of rest) {
      if (part.startsWith("dub=")) streams.push(...parseStreams(part, "dub", bases));
      else if (part.startsWith("leg=")) streams.push(...parseStreams(part, "leg", bases));
    }
    if (streams.length > 0) {
      const normRaw = normalizeTitle(title);
      const normClean = normalizeTitle(cleanDisplayTitle(title));
      const keys = new Set([normRaw, normClean]);
      for (const k of keys) {
        if (!k) continue;
        const existing = map.get(k) || [];
        const existingUrls = new Set(existing.map((s) => s.url));
        const newStreams = streams.filter((s) => !existingUrls.has(s.url));
        map.set(k, [...existing, ...newStreams]);
      }
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
function parseSeriesData(text: string, bases: string[] = []): {
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
    const streams = parseStreams(urlsRaw ?? "", audio, bases);

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

  const bases = await getIndiceBases().catch(() => []);

  if (type === "a") {
    try {
      // Baixa em paralelo todas as partes (0..12) de animes para esta letra
      const partIndices = Array.from({ length: 13 }, (_, i) => i);
      const results = await Promise.allSettled(
        partIndices.map((part) => fetchAnimeText(`animes-${letter}-${part}.txt`))
      );
      const combinedText = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && !!r.value)
        .map((r) => r.value)
        .join("\n");

      if (combinedText.trim()) {
        const { streams, seasons } = parseSeriesData(combinedText, bases);
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

  if (type === "f") {
    try {
      const text = await fetchText(getCatalogUrls(`filmes-${letter}.txt`));
      const parsed = parseFilmesFile(text, bases);
      streamsCache.set(cacheKey, parsed);
      return parsed;
    } catch {
      const empty = new Map<string, StreamSource[]>();
      streamsCache.set(cacheKey, empty);
      return empty;
    }
  }

  // Para séries (type === "s"):
  // Baixa em paralelo todas as partes (0..12) de séries para esta letra
  try {
    const partIndices = Array.from({ length: 13 }, (_, i) => i);
    const results = await Promise.allSettled(
      partIndices.map((part) => fetchText(getCatalogUrls(`series-${letter}-${part}.txt`)))
    );
    const combinedSeriesText = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && !!r.value)
      .map((r) => r.value)
      .join("\n");

    if (combinedSeriesText.trim()) {
      const { streams, seasons } = parseSeriesData(combinedSeriesText, bases);
      streamsCache.set(cacheKey, streams);
      seriesSeasonsCache.set(letter, seasons);
      return streams;
    }
  } catch {
    // continua
  }

  const empty = new Map<string, StreamSource[]>();
  streamsCache.set(cacheKey, empty);
  return empty;
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
  const cleanNorm = normalizeTitle(cleanDisplayTitle(title));
  const letter = getLetterKey(title);
  const streamsMap = await getStreamsForLetter(type, letter);
  const found = streamsMap.get(norm) || streamsMap.get(cleanNorm);
  if (found && found.length > 0) return found;

  return [];
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
    const seenAnimeIds = new Set<string>();
    const uniqueAnimes: Array<Omit<CatalogItem, "streams" | "seasons">> = [];
    for (const [key, base] of animesFichas) {
      fichas.set(key, base);
      if (!seenAnimeIds.has(base.id)) {
        seenAnimeIds.add(base.id);
        uniqueAnimes.push(base);
      }
    }

    // Se houver animes, adiciona a fileira "Animes em alta" aos destaques da Home (sem duplicatas)
    if (uniqueAnimes.length > 0) {
      highlights.unshift({
        rowName: "Animes em alta",
        items: uniqueAnimes.map((a) => ({
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
    items.set(key, { ...base, streams: [], ...(key !== base.id ? { alias: true } : {}) });
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
    if (item.alias) continue;
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
  const raw = Array.from(items.values()).filter(
    (item) => !item.alias && (!q || normalizeTitle(item.title).includes(q))
  );
  const seen = new Set<string>();
  const deduped: CatalogItem[] = [];
  for (const item of raw) {
    const key = `${item.type}:${item.tmdbId ?? normalizeTitle(item.title)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }
  return deduped;
}
