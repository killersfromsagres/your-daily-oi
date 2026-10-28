import type { CatalogItem, SeasonItem, EpisodeItem, StreamSource, AudioTrack } from "./types";

export interface SushiAnimeCard {
  id: string; // slug, ex: "one-piece-dublado-760"
  slug: string;
  title: string;
  posterUrl: string;
  quality?: string;
  rating?: number;
  genres: string[];
  audio: AudioTrack;
  year?: number;
}

export interface SushiCatalogResponse {
  items: SushiAnimeCard[];
  pagina: number;
  totalPaginas: number;
  totalItens: number;
}

const SUSHI_BASE = "https://sushianimes.com.br";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://sushianimes.com.br/",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate",
};

// Caches em memória
// Catálogo e detalhes de animes: 6 horas (21600000 ms)
const CATALOG_TTL = 6 * 60 * 60 * 1000;
// Streams de episódios: 1 hora (3600000 ms)
const STREAM_TTL = 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const catalogCache = new Map<string, CacheEntry<SushiCatalogResponse>>();
const animeDetailCache = new Map<string, CacheEntry<CatalogItem>>();
const episodeStreamCache = new Map<string, CacheEntry<StreamSource[]>>();

/**
 * Fetch seguro com timeout de 12s e headers simulando navegador real
 */
async function fetchSushi(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...DEFAULT_HEADERS,
        ...(init?.headers || {}),
      },
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normaliza slug de anime
 */
export function normalizeSushiSlug(slugOrUrl: string): string {
  let s = slugOrUrl.trim();
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      s = u.pathname.replace(/^\/anime\//, "");
    } catch {}
  }
  s = s.replace(/^\/anime\//, "").replace(/\/+$/, "");
  return s;
}

/**
 * Parse do HTML da grade do catálogo (/animes ou /category/{categoria})
 */
export function parseSushiCatalog(html: string, page = 1): SushiCatalogResponse {
  const items: SushiAnimeCard[] = [];

  // Extrai total de itens se presente no texto (ex: "618 contém conteúdo")
  let totalItens = 0;
  const countMatch = html.match(/(\d+)\s+contém conteúdo/i);
  if (countMatch) {
    totalItens = parseInt(countMatch[1], 10);
  }

  // Regex para os cards .list-movie
  // Cada card tem:
  // <div class="list-movie">
  //   <a href="https://sushianimes.com.br/anime/{slug}" class="list-media">
  //     <div class="quality">HD</div>
  //     <div class="imdb"><span>7.474</span></div>
  //     <div class="media media-cover" data-src="..."></div>
  //   </a>
  //   <div class="list-caption">
  //     <a href="..." class="list-title">Titulo</a>
  //     <a href="..." class="list-category">Categoria</a>
  const cardRegex = /<div class="list-movie">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const cardHtml = match[1];

    const hrefMatch = cardHtml.match(/href=["'](?:https?:\/\/sushianimes\.com\.br)?\/anime\/([^"']+)["']/i);
    if (!hrefMatch) continue;

    const slug = normalizeSushiSlug(hrefMatch[1]);
    if (!slug) continue;

    const titleMatch = cardHtml.match(/class=["'][^"']*list-title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : slug;

    const qualityMatch = cardHtml.match(/class=["'][^"']*quality[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const quality = qualityMatch ? qualityMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

    const imdbMatch = cardHtml.match(/class=["'][^"']*imdb[^"']*["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i);
    const ratingStr = imdbMatch ? imdbMatch[1].trim() : undefined;
    const rating = ratingStr ? parseFloat(ratingStr) : undefined;

    const coverMatch =
      cardHtml.match(/data-src=["']([^"']+)["']/i) ||
      cardHtml.match(/src=["']([^"']+)["']/i) ||
      cardHtml.match(/style=["'][^"']*url\(['"]?([^'"\)]+)['"]?\)/i);
    const posterUrl = coverMatch ? coverMatch[1].trim() : "";

    const catMatch = cardHtml.match(/class=["'][^"']*list-category[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const genre = catMatch ? catMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const genres = genre ? [genre] : [];

    const isDub = rawTitle.toLowerCase().includes("dublado") || slug.toLowerCase().includes("dublado");
    const audio: AudioTrack = isDub ? "dub" : "leg";

    items.push({
      id: slug,
      slug,
      title: rawTitle,
      posterUrl,
      quality,
      rating: isNaN(Number(rating)) ? undefined : rating,
      genres,
      audio,
    });
  }

  // Se não achou cards com o regex fechado, tenta via regex mais tolerante
  if (items.length === 0) {
    const looseRegex = /<a\b[^>]*href=["'](?:https?:\/\/sushianimes\.com\.br)?\/anime\/([^"']+)["'][^>]*class="list-media"[\s\S]*?<a\b[^>]*class="list-title"[^>]*>([\s\S]*?)<\/a>/gi;
    let lm;
    while ((lm = looseRegex.exec(html)) !== null) {
      const slug = normalizeSushiSlug(lm[1]);
      const title = lm[2].replace(/<[^>]+>/g, "").trim();
      const isDub = title.toLowerCase().includes("dublado") || slug.toLowerCase().includes("dublado");
      items.push({
        id: slug,
        slug,
        title,
        posterUrl: "",
        genres: [],
        audio: isDub ? "dub" : "leg",
      });
    }
  }

  // Cálculo de total de páginas
  let totalPaginas = 1;
  if (totalItens > 0) {
    totalPaginas = Math.ceil(totalItens / 40);
  } else {
    const pageLinks = html.match(/page=(\d+)/g) || [];
    let maxP = 1;
    for (const pl of pageLinks) {
      const num = parseInt(pl.replace("page=", ""), 10);
      if (num > maxP) maxP = num;
    }
    totalPaginas = maxP > 1 ? maxP : (items.length >= 40 ? page + 1 : page);
    totalItens = totalPaginas * 40;
  }

  return {
    items,
    pagina: page,
    totalPaginas,
    totalItens,
  };
}

/**
 * Busca página do catálogo Sushi Animes
 */
export async function getSushiCatalog(
  page = 1,
  category?: string
): Promise<SushiCatalogResponse> {
  const normCat = (category || "").trim().toLowerCase();
  const cacheKey = `cat-${page}-${normCat}`;
  const now = Date.now();
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.data;
  }

  try {
    let url = `${SUSHI_BASE}/animes?page=${page}`;
    if (normCat && normCat !== "todos") {
      url = `${SUSHI_BASE}/animes?category=${encodeURIComponent(normCat)}&page=${page}`;
    }

    const res = await fetchSushi(url);
    if (!res.ok) {
      console.warn(`[SushiCatalog] Upstream HTTP ${res.status} para ${url}`);
      return { items: [], pagina: page, totalPaginas: 1, totalItens: 0 };
    }

    const html = await res.text();
    const parsed = parseSushiCatalog(html, page);

    catalogCache.set(cacheKey, { data: parsed, expires: now + CATALOG_TTL });
    return parsed;
  } catch (err) {
    console.error("[SushiCatalog] Erro ao buscar catálogo:", err);
    return { items: [], pagina: page, totalPaginas: 1, totalItens: 0 };
  }
}

/**
 * Pesquisa no Sushi Animes via endpoint oficial /ajax/posts?q=...
 */
export async function searchSushiAnimes(query: string): Promise<SushiAnimeCard[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = `search-${q.toLowerCase()}`;
  const now = Date.now();
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.data.items;
  }

  try {
    const searchUrl = `${SUSHI_BASE}/ajax/posts?q=${encodeURIComponent(q)}`;
    const res = await fetchSushi(searchUrl, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{
          id: number | string;
          name: string;
          image: string;
          url: string;
          type: string;
        }>;
      };

      if (Array.isArray(data?.data) && data.data.length > 0) {
        const results: SushiAnimeCard[] = data.data.map((item) => {
          const slug = normalizeSushiSlug(item.url || String(item.id));
          const isDub =
            item.name.toLowerCase().includes("dublado") || slug.toLowerCase().includes("dublado");
          return {
            id: slug,
            slug,
            title: item.name,
            posterUrl: item.image,
            genres: [],
            audio: isDub ? "dub" : "leg",
          };
        });

        catalogCache.set(cacheKey, {
          data: { items: results, pagina: 1, totalPaginas: 1, totalItens: results.length },
          expires: now + CATALOG_TTL,
        });

        return results;
      }
    }
  } catch (err) {
    console.warn("[SushiSearch] Falha no /ajax/posts, tentando fallback do catálogo:", err);
  }

  // Fallback: se /ajax/posts falhou (ex: 503 temporário de rate limit), busca na 1ª página do catálogo
  try {
    const cat = await getSushiCatalog(1);
    const normQ = q.toLowerCase();
    const fallbackResults = cat.items.filter((item) =>
      item.title.toLowerCase().includes(normQ) || item.slug.toLowerCase().includes(normQ)
    );
    return fallbackResults;
  } catch {
    return [];
  }
}

/**
 * Busca ficha completa de um anime (/anime/{slug}) e retorna como CatalogItem
 */
export async function getSushiAnime(slugOrUrl: string): Promise<CatalogItem | null> {
  const slug = normalizeSushiSlug(slugOrUrl);
  if (!slug) return null;

  const now = Date.now();
  const cached = animeDetailCache.get(slug);
  if (cached && cached.expires > now) {
    return cached.data;
  }

  try {
    const url = `${SUSHI_BASE}/anime/${slug}`;
    const res = await fetchSushi(url);
    if (!res.ok) {
      console.warn(`[SushiAnime] Upstream HTTP ${res.status} para ${url}`);
      return null;
    }

    const html = await res.text();
    if (!html || html.length < 500) {
      return null;
    }

    // 1. Título
    const titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : slug;

    // 2. Poster
    const ogImg =
      html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i) ||
      html.match(/<div class="media media-cover[^"]*"[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
    const posterUrl = ogImg ? ogImg[1].trim() : "";

    // 3. Sinopse
    const ogDesc =
      html.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](?:og:description|description)["']/i);
    const synopsis = ogDesc
      ? ogDesc[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim()
      : "Assista a este anime completo em alta definição no Zang Flix.";

    // 4. Gêneros
    const genres: string[] = [];
    const gRegex = /itemprop="genre"[^>]*>([\s\S]*?)<\/a>/gi;
    let gm;
    while ((gm = gRegex.exec(html)) !== null) {
      const g = gm[1].replace(/<[^>]+>/g, "").trim();
      if (g && !genres.includes(g)) genres.push(g);
    }
    if (genres.length === 0) {
      genres.push("Anime");
    }

    // 5. Temporadas e Episódios
    // No Sushi, cada card de episódio tem a classe .epx-card:
    // <a href="https://sushianimes.com.br/anime/{slug}-{seasonId}-season-{epNum}-episode"
    //    class="epx-card js-epx-item" ...>
    //    <div class="epx-thumb lazy" data-src="..."></div>
    //    <div class="epx-title">1º Episódio</div>
    //    <div class="epx-desc">Título do episódio</div>
    // </a>
    const epMap = new Map<number, EpisodeItem[]>();

    const cardRegex =
      /<a\b[^>]*href=["'](https?:\/\/sushianimes\.com\.br\/anime\/[^"']*-season-(\d+)-episode)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let cm;

    while ((cm = cardRegex.exec(html)) !== null) {
      const epHref = cm[1];
      const cardInner = cm[3];

      const epTitleMatch = cardInner.match(/<div class="epx-title">([\s\S]*?)<\/div>/i);
      const epDescMatch = cardInner.match(/<div class="epx-desc"[^>]*>([\s\S]*?)<\/div>/i);
      const thumbMatch = cardInner.match(/data-src=["']([^"']+)["']/i) || cardInner.match(/src=["']([^"']+)["']/i);

      let epNum = 1;
      if (epTitleMatch) {
        const numM = epTitleMatch[1].match(/(\d+)/);
        if (numM) epNum = parseInt(numM[1], 10);
      } else {
        const hrefM = epHref.match(/-season-(\d+)-episode/);
        if (hrefM) epNum = parseInt(hrefM[1], 10);
      }

      // Temporada: extrai de -(\d+)-season- na URL do episódio
      const seasonM = epHref.match(/-(\d+)-season-/);
      const seasonNum = seasonM ? parseInt(seasonM[1], 10) : 1;

      if (!epMap.has(seasonNum)) epMap.set(seasonNum, []);

      const epSlug = epHref.replace(/^https?:\/\/sushianimes\.com\.br\/anime\//, "");
      const epTitle = epTitleMatch ? epTitleMatch[1].trim() : `Episódio ${epNum}`;
      const epName = epDescMatch ? epDescMatch[1].trim() : undefined;

      epMap.get(seasonNum)!.push({
        seasonNumber: seasonNum,
        episodeNumber: epNum,
        title: epName ? `${epTitle}: ${epName}` : epTitle,
        name: epName,
        episodeSlug: epSlug,
        thumbUrl: thumbMatch ? thumbMatch[1].trim() : undefined,
        streams: [],
      });
    }

    const seasons: SeasonItem[] = Array.from(epMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([sNum, eps]) => ({
        seasonNumber: sNum,
        episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber),
      }));

    const isDub = title.toLowerCase().includes("dublado") || slug.toLowerCase().includes("dublado");

    const catalogItem: CatalogItem = {
      id: slug,
      title,
      type: "a",
      posterUrl,
      genres,
      streams: [],
      seasons,
      tmdb: {
        overview: synopsis,
        voteAverage: 8.5,
        backdropPath: null,
        backdropUrl: posterUrl,
        trailerId: null,
        cast: [],
        releaseYear: null,
        format: isDub ? "Dublado" : "Legendado",
      },
    };

    animeDetailCache.set(slug, { data: catalogItem, expires: now + CATALOG_TTL });
    return catalogItem;
  } catch (err) {
    console.error(`[SushiAnime] Erro ao buscar anime ${slug}:`, err);
    return null;
  }
}

/**
 * Resolve o stream real (.m3u8 ou .mp4) de um episódio específico do Sushi Animes
 */
export async function resolveSushiEpisodeStream(
  animeSlug: string,
  seasonNumber: number,
  episodeNumber: number,
  directEpisodeSlug?: string
): Promise<StreamSource[]> {
  const normSlug = normalizeSushiSlug(animeSlug);
  const cacheKey = `stream-${normSlug}-s${seasonNumber}-e${episodeNumber}`;
  const now = Date.now();

  const cached = episodeStreamCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.data;
  }

  try {
    let epSlug = directEpisodeSlug ? normalizeSushiSlug(directEpisodeSlug) : "";

    // Se o slug do episódio não foi passado diretamente, localiza na ficha do anime
    if (!epSlug) {
      const anime = await getSushiAnime(normSlug);
      const season = anime?.seasons?.find((s) => s.seasonNumber === seasonNumber) || anime?.seasons?.[0];
      const ep = season?.episodes?.find((e) => e.episodeNumber === episodeNumber);
      if (ep?.episodeSlug) {
        epSlug = ep.episodeSlug;
      } else {
        // Padrão do Sushi: {animeSlug}-{seasonNumber}-season-{episodeNumber}-episode
        epSlug = `${normSlug}-${seasonNumber}-season-${episodeNumber}-episode`;
      }
    }

    const epUrl = `${SUSHI_BASE}/anime/${epSlug}`;
    const epRes = await fetchSushi(epUrl);
    if (!epRes.ok) {
      console.warn(`[SushiEp] HTTP ${epRes.status} para episódio ${epUrl}`);
      return [];
    }

    const epCookie = epRes.headers.get("set-cookie") || "";
    const epHtml = await epRes.text();

    // Extrai o token CSRF necessário para chamar /ajax/embed
    const csrfMatch =
      epHtml.match(/name="csrf-token"\s+content="([^"]+)"/i) ||
      epHtml.match(/_TOKEN\s*=\s*["']([^"']+)["']/i);
    const token = csrfMatch ? csrfMatch[1] : "";

    // Localiza todos os botões de players disponíveis
    // <button type="button" class="btn-service dropdown-source" data-embed="34603" data-player-name="FullHD / HLS" ...>
    const buttons: Array<{ embedId: string; name: string }> = [];
    const bRegex =
      /<button\b[^>]*data-embed=["'](\d+)["'][^>]*data-player-name=["']([^"']*)["'][^>]*>/gi;
    let b;
    while ((b = bRegex.exec(epHtml)) !== null) {
      buttons.push({ embedId: b[1], name: b[2] });
    }

    // Se não encontrou pelo regex completo, tenta data-embed direto
    if (buttons.length === 0) {
      const idMatches = epHtml.matchAll(/data-embed=["'](\d+)["']/g);
      for (const m of idMatches) {
        if (!buttons.some((btn) => btn.embedId === m[1])) {
          buttons.push({ embedId: m[1], name: "Sushi Player" });
        }
      }
    }

    // Prioriza botões FullHD / HLS primeiro, Mobile depois
    buttons.sort((a, b) => {
      const aFull = a.name.toLowerCase().includes("fullhd") || a.name.toLowerCase().includes("hls");
      const bFull = b.name.toLowerCase().includes("fullhd") || b.name.toLowerCase().includes("hls");
      if (aFull && !bFull) return -1;
      if (!aFull && bFull) return 1;
      return 0;
    });

    const isDub =
      normSlug.toLowerCase().includes("dublado") || epSlug.toLowerCase().includes("dublado");
    const audioTrack: AudioTrack = isDub ? "dub" : "leg";

    const sources: StreamSource[] = [];

    for (const btn of buttons) {
      try {
        const postHeaders: Record<string, string> = {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: epUrl,
          Origin: SUSHI_BASE,
        };
        if (epCookie) postHeaders["Cookie"] = epCookie;
        if (token) postHeaders["X-CSRF-TOKEN"] = token;

        const embedRes = await fetchSushi(`${SUSHI_BASE}/ajax/embed`, {
          method: "POST",
          headers: postHeaders,
          body: new URLSearchParams({ id: btn.embedId, _token: token }),
        });

        if (!embedRes.ok) continue;

        const embedText = await embedRes.text();

        // 1. Procura playerEmbed="https://..." (comum em HLS e MP4 direto)
        const embedMatch =
          embedText.match(/playerEmbed\s*=\s*(?:&quot;|["'])(https?:\/\/[^"&]+)(?:&quot;|["'])/i) ||
          embedText.match(/src=["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);

        if (embedMatch) {
          const streamUrl = embedMatch[1];
          const isHls = streamUrl.includes(".m3u8");
          const format = isHls ? "hls" : "mp4";
          const quality = btn.name.toLowerCase().includes("fullhd") ? "FHD" : "HD";

          sources.push({
            url: streamUrl,
            format,
            audio: audioTrack,
            quality,
            priority: sources.length,
          });
        }
      } catch (err) {
        console.warn(`[SushiEp] Erro no embed ${btn.embedId}:`, err);
      }
    }

    if (sources.length > 0) {
      episodeStreamCache.set(cacheKey, { data: sources, expires: now + STREAM_TTL });
    }

    return sources;
  } catch (err) {
    console.error(`[SushiEp] Falha ao resolver episódio ${animeSlug} S${seasonNumber}E${episodeNumber}:`, err);
    return [];
  }
}
