import type { AudioTrack, CatalogItem, HighlightItem, HighlightRow, StreamFormat, StreamSource } from "./types";

const SAIMO_PAGES = process.env.SAIMO_VOD_PAGES ?? "https://saimo-filmes.pages.dev";
const SAIMO_RAW = process.env.SAIMO_VOD_RAW ?? "https://raw.githubusercontent.com/gabrielsaimo/SaimoPlayer/main/vod";
const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "";

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

async function fetchText(urls: string[]): Promise<string> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 21600 } } as RequestInit);
      if (res.ok) return await res.text();
    } catch {
      // tenta próximo
    }
  }
  throw new Error(`Falha ao buscar: ${urls[0]}`);
}

function vodUrls(path: string): string[] {
  const urls: string[] = [];
  if (SNAPSHOT_URL) urls.push(`${SNAPSHOT_URL}/${path}`);
  urls.push(`${SAIMO_PAGES}/vod/${path}`);
  urls.push(`${SAIMO_RAW}/${path}`);
  return urls;
}

// Parse de fichas.txt: tipo\tTítulo\tTMDB_ID\tposter_path\tGênero1,Gênero2,...
function parseFichas(text: string): Map<string, Omit<CatalogItem, "streams" | "seasons">> {
  const map = new Map<string, Omit<CatalogItem, "streams" | "seasons">>();
  for (const line of text.split("\n")) {
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
      // Adicionar ao último row criado
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

export async function loadCatalog(): Promise<{ items: Map<string, CatalogItem>; highlights: HighlightRow[] }> {
  const now = Date.now();
  if (catalogCache && highlightCache && now - cacheTime < CACHE_TTL) {
    return { items: catalogCache, highlights: highlightCache };
  }

  // Carrega fichas.txt e destaques.txt em paralelo
  const [fichasText, destaquesText] = await Promise.all([
    fetchText(vodUrls("fichas.txt")),
    fetchText(vodUrls("destaques.txt")),
  ]);

  const fichas = parseFichas(fichasText);
  const highlights = parseDestaques(destaquesText);

  // Carrega filmes por letra (A-Z + #) em paralelo
  const letters = ["#", ..."abcdefghijklmnopqrstuvwxyz".split("")];
  const filmeResults = await Promise.allSettled(
    letters.map((l) => fetchText(vodUrls(`filmes-${l}.txt`)).then((t) => parseFilmesFile(t)))
  );

  // Monta índice final
  const items = new Map<string, CatalogItem>();
  for (const [key, base] of fichas) {
    const streams: StreamSource[] = [];
    for (const result of filmeResults) {
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
