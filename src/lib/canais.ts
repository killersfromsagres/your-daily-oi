import { fetchFirstText, sourceUrls } from "./saimo-source";
import { looksOffline } from "./live-source";

/** Também aceita listas IPTV M3U sem perder referer e user-agent. */
export function parseM3UCanais(texto: string): CanalTV[] {
  const channels = new Map<string, CanalTV>();
  let meta: { nome: string; logo?: string; categoria: string; referer?: string; agente?: string } | null = null;
  for (const raw of texto.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      const attr = (name: string): string | undefined => {
        const match = line.match(new RegExp(name + '="([^"]*)"', "i"));
        return match?.[1]?.trim() || undefined;
      };
      const comma = line.indexOf(",");
      const nome = (comma >= 0 ? line.slice(comma + 1) : attr("tvg-name"))?.trim() || attr("tvg-name") || "";
      meta = nome ? {
        nome, ...(attr("tvg-logo") ? { logo: attr("tvg-logo") } : {}),
        categoria: normalizeCategoria(attr("group-title") || "", nome),
      } : null;
    } else if (meta && line.startsWith("#EXTVLCOPT:")) {
      const option = line.slice(11);
      const separator = option.indexOf("=");
      if (separator > 0) {
        const key = option.slice(0, separator).toLowerCase();
        const value = option.slice(separator + 1).trim();
        if (key === "http-referrer") meta.referer = value;
        if (key === "http-user-agent") meta.agente = value;
      }
    } else if (meta && /^https?:\/\//i.test(line)) {
      const key = slugifyCanal(meta.nome);
      let canal = channels.get(key);
      if (!canal) {
        canal = { id: key, nome: meta.nome, ...(meta.logo ? { logo: meta.logo } : {}), categoria: meta.categoria, fontes: [] };
        channels.set(key, canal);
      }
      if (!canal.fontes.some((fonte) => fonte.url === line)) {
        canal.fontes.push({ url: line, ...(meta.referer ? { referer: meta.referer } : {}), ...(meta.agente ? { agente: meta.agente } : {}) });
      }
      meta = null;
    }
  }
  return [...channels.values()];
}

/**
 * Módulo de Catálogo e Dados de TV Ao Vivo e Rádios (Saimo TV)
 */

export interface FonteTV {
  url: string;
  qualidade?: string;
  nome?: string;
  referer?: string;
  agente?: string;
  chave?: string;
}

export interface CanalTV {
  id: string;
  nome: string;
  logo?: string;
  categoria: string;
  fontes: FonteTV[];
  indisponivel?: boolean;
}

export interface RadioItem {
  id: string;
  nome: string;
  url: string;
  logo?: string;
}

const CANAIS_URL = "https://canais-saimo.pages.dev/catalogo.txt";
const RADIOS_URL = "https://canais-saimo.pages.dev/radios.txt";
const DESATIVADOS_URL = "https://saimo-tv.pages.dev/fontes-desativadas.json";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos: Saimo muda as fontes ao vivo frequentemente
const DESATIVADOS_TTL_MS = 60 * 60 * 1000; // 1 hora

let canaisCache: CanalTV[] | null = null;
let canaisCacheTime = 0;
let canaisCategoriasCache: string[] = [];

let desativadosCache: string[] = [];
let desativadosCacheTime = 0;

let radiosCache: RadioItem[] | null = null;
let radiosCacheTime = 0;

/**
 * Obtém a lista atualizada de hostnames desativados da Saimo TV
 */
async function fetchFontesDesativadas(): Promise<string[]> {
  const now = Date.now();
  if (desativadosCache.length > 0 && now - desativadosCacheTime < DESATIVADOS_TTL_MS) {
    return desativadosCache;
  }

  try {
    const res = await fetch(DESATIVADOS_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, */*",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = (await res.json()) as { desativados?: string[] };
      if (Array.isArray(data?.desativados)) {
        desativadosCache = data.desativados
          .filter((h): h is string => typeof h === "string")
          .map((h) => h.toLowerCase().trim());
        desativadosCacheTime = now;
        return desativadosCache;
      }
    }
  } catch (err) {
    console.warn("[CanaisTV] Falha ao obter painel de fontes desativadas (usando fallback):", err);
  }

  return desativadosCache;
}

/**
 * Converte o nome do canal em slug URL-friendly
 */
export function slugifyCanal(nome: string): string {
  return (
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, "-e-")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "canal"
  );
}

/**
 * Normaliza categoria para as categorias padrão do site
 */
function normalizeCategoria(raw: string, nomeCanal: string): string {
  const c = raw.trim();
  if (c) return c;

  const n = nomeCanal.toLowerCase();
  if (/globo|sbt|record|band|cultura|redetv|gazeta/i.test(n)) return "TV Aberta";
  if (/espn|sportv|premiere|combate|band sports|nba|conmebol|dsports/i.test(n)) return "Esportes";
  if (/globonews|cnn|bandnews|jovem pan|record news/i.test(n)) return "Notícias";
  if (/cartoon|disney|nickelodeon|nick|discovery kids|gloob|tooncast|anime/i.test(n)) return "Infantil";
  if (/discovery|history|national geographic|nat geo|animal planet/i.test(n)) return "Documentários";
  if (/telecine|hbo|tnt|megapix|paramount|universal|warner|sony|cinemax|space/i.test(n)) return "Filmes e Séries";
  return "Variedades";
}

/**
 * Faz o parser do arquivo catalogo.txt tolerante a falhas
 */
export function parseCanais(texto: string): CanalTV[] {
  if (texto.trimStart().startsWith("#EXTM3U")) return parseM3UCanais(texto);
  const lines = texto.split("\n");
  const canais: CanalTV[] = [];
  const slugCounts = new Map<string, number>();

  let currentCanal: {
    nome: string;
    categoria: string;
    logo?: string;
    fontes: FonteTV[];
  } | null = null;
  let currentFonte: FonteTV | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === "canal") {
      if (currentCanal && currentCanal.fontes.length > 0) {
        const baseSlug = slugifyCanal(currentCanal.nome);
        const count = (slugCounts.get(baseSlug) ?? 0) + 1;
        slugCounts.set(baseSlug, count);
        const id = count === 1 ? baseSlug : `${baseSlug}-${count}`;

        canais.push({
          id,
          nome: currentCanal.nome,
          categoria: currentCanal.categoria,
          logo: currentCanal.logo,
          fontes: currentCanal.fontes,
        });
      }

      currentCanal = {
        nome: val,
        categoria: normalizeCategoria("", val),
        logo: undefined,
        fontes: [],
      };
      currentFonte = null;
    } else if (currentCanal) {
      if (key === "categoria") {
        currentCanal.categoria = normalizeCategoria(val, currentCanal.nome);
      } else if (key === "logo") {
        currentCanal.logo = val;
      } else if (key === "fonte") {
        currentFonte = { url: val };
        currentCanal.fontes.push(currentFonte);
      } else if (currentFonte) {
        if (key === "qualidade") currentFonte.qualidade = val;
        else if (key === "nome") currentFonte.nome = val;
        else if (key === "referer") currentFonte.referer = val;
        else if (key === "agente") currentFonte.agente = val;
        else if (key === "chave") currentFonte.chave = val;
      }
    }
  }

  // Adiciona o último canal do arquivo
  if (currentCanal && currentCanal.fontes.length > 0) {
    const baseSlug = slugifyCanal(currentCanal.nome);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const id = count === 1 ? baseSlug : `${baseSlug}-${count}`;

    canais.push({
      id,
      nome: currentCanal.nome,
      categoria: currentCanal.categoria,
      logo: currentCanal.logo,
      fontes: currentCanal.fontes,
    });
  }

  return canais;
}

/**
 * Parser de radios.txt no formato Nome|URL_do_stream|URL_da_logo
 */
export function parseRadios(texto: string): RadioItem[] {
  const lines = texto.split("\n");
  const radios: RadioItem[] = [];
  const slugCounts = new Map<string, number>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 2) continue;

    const [nome, url, logo] = parts;
    if (!nome || !url) continue;

    const baseSlug = slugifyCanal(nome);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const id = count === 1 ? baseSlug : `${baseSlug}-${count}`;

    radios.push({
      id,
      nome,
      url,
      logo: logo && logo.startsWith("http") ? logo : undefined,
    });
  }

  return radios;
}

/**
 * Filtra fontes de hosts desativados e extrai categorias organizadas
 */
export function filterCanaisAndExtractCategories(
  canaisRaw: CanalTV[],
  desativados: string[] = []
): { canais: CanalTV[]; categorias: string[] } {
  const desativadosSet = new Set(desativados.map((d) => d.toLowerCase().trim()));

  const canais: CanalTV[] = [];
  for (const c of canaisRaw) {
    const fontesVivas = c.fontes.filter((f) => {
      try {
        const host = new URL(f.url).hostname.toLowerCase();
        return !desativadosSet.has(host) && !looksOffline(f);
      } catch {
        return false;
      }
    });
    // Preserva todos os nomes de canais declarados no Saimo.
    // Sem streams válidos, exibe-os como indisponíveis em vez de omiti-los.
    canais.push({
      ...c,
      fontes: fontesVivas,
      indisponivel: fontesVivas.length === 0,
    });
  }

  const preferredOrder = [
    "TV Aberta",
    "Esportes",
    "Notícias",
    "Infantil",
    "Documentários",
    "Filmes e Séries",
    "Variedades",
  ];

  const foundCats = new Set<string>();
  for (const c of canais) {
    if (c.categoria) foundCats.add(c.categoria);
  }

  const categorias: string[] = [];
  for (const p of preferredOrder) {
    if (foundCats.has(p)) {
      categorias.push(p);
      foundCats.delete(p);
    }
  }
  for (const r of foundCats) {
    categorias.push(r);
  }

  return { canais, categorias };
}

/**
 * Fallback no navegador caso a rota /api/canais falhe ou esteja indisponível
 */
export async function fetchCanaisFallbackClient(): Promise<{
  atualizadoEm: string;
  categorias: string[];
  canais: CanalTV[];
}> {
  const [txtRes, desativadosRes] = await Promise.allSettled([
    fetch(CANAIS_URL),
    fetch(DESATIVADOS_URL),
  ]);

  if (txtRes.status !== "fulfilled" || !txtRes.value.ok) {
    throw new Error("Falha ao obter catálogo ao vivo de canais");
  }

  const text = await txtRes.value.text();
  const canaisRaw = parseCanais(text);

  let desativados: string[] = [];
  if (desativadosRes.status === "fulfilled" && desativadosRes.value.ok) {
    try {
      const data = (await desativadosRes.value.json()) as { desativados?: string[] };
      if (Array.isArray(data?.desativados)) {
        desativados = data.desativados.filter((h): h is string => typeof h === "string");
      }
    } catch {
      // ignora
    }
  }

  const { canais, categorias } = filterCanaisAndExtractCategories(canaisRaw, desativados);

  return {
    atualizadoEm: new Date().toISOString(),
    categorias,
    canais,
  };
}

/**
 * Une espelhos e playlists M3U sem perder os canais do catálogo primário.
 * Duplicatas por nome/slug recebem fontes alternativas, em vez de outra entrada.
 */
export function mergeCanaisCatalogs(catalogs: CanalTV[][]): CanalTV[] {
  const merged = new Map<string, CanalTV>();
  for (const catalog of catalogs) for (const canal of catalog) {
    const key = slugifyCanal(canal.nome);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...canal, id: key, fontes: [...canal.fontes] });
      continue;
    }
    const known = new Set(current.fontes.map((f) => f.url));
    for (const fonte of canal.fontes) {
      if (!known.has(fonte.url)) {
        current.fontes.push(fonte);
        known.add(fonte.url);
      }
    }
    if (!current.logo && canal.logo) current.logo = canal.logo;
  }
  return [...merged.values()];
}

/**
 * Carrega e faz cache server-side dos canais da Saimo TV
 */
export async function loadCanais(): Promise<{
  atualizadoEm: string;
  categorias: string[];
  canais: CanalTV[];
}> {
  const now = Date.now();
  if (canaisCache && now - canaisCacheTime < CACHE_TTL_MS) {
    return {
      atualizadoEm: new Date(canaisCacheTime).toISOString(),
      categorias: canaisCategoriasCache,
      canais: canaisCache,
    };
  }

  try {
    const urls = sourceUrls(
      typeof process !== "undefined" ? process.env.SAIMO_CANAIS_URLS : undefined,
      [CANAIS_URL],
    );
    const downloaded = await Promise.allSettled(
      urls.map(async (sourceUrl) => {
        const { text } = await fetchFirstText([sourceUrl], "canais", { timeoutMs: 8000 });
        const parsed = parseCanais(text);
        if (!parsed.length) throw new Error(`Formato sem canais: ${sourceUrl}`);
        return parsed;
      }),
    );
    const catalogs = downloaded
      .filter((r): r is PromiseFulfilledResult<CanalTV[]> => r.status === "fulfilled")
      .map((r) => r.value);
    if (!catalogs.length) throw new Error("Todas as origens de canais estão indisponíveis");
    const canaisRaw = mergeCanaisCatalogs(catalogs);

    // Exclui apenas fontes de manutenção e servidores declaradamente desativados.
    const desativados = await fetchFontesDesativadas();
    const { canais, categorias } = filterCanaisAndExtractCategories(canaisRaw, desativados);
    if (!canais.some((canal) => canal.fontes.length > 0)) throw new Error("Nenhum canal com fonte válida");

    canaisCache = canais;
    canaisCategoriasCache = categorias;
    canaisCacheTime = now;

    return {
      atualizadoEm: new Date(now).toISOString(),
      categorias,
      canais,
    };
  } catch (err) {
    console.error("[CanaisTV] Erro ao carregar catálogo de canais:", err);
    if (canaisCache) {
      return {
        atualizadoEm: new Date(canaisCacheTime).toISOString(),
        categorias: canaisCategoriasCache,
        canais: canaisCache,
      };
    }
    return {
      atualizadoEm: new Date().toISOString(),
      categorias: [],
      canais: [],
    };
  }
}

/**
 * Carrega e faz cache server-side da lista de rádios
 */
export async function loadRadios(): Promise<{ radios: RadioItem[] }> {
  const now = Date.now();
  if (radiosCache && now - radiosCacheTime < CACHE_TTL_MS) {
    return { radios: radiosCache };
  }

  try {
    const res = await fetch(RADIOS_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/plain, */*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Falha HTTP ${res.status} ao obter radios.txt`);
    }

    const text = await res.text();
    const radios = parseRadios(text);

    radiosCache = radios;
    radiosCacheTime = now;

    return { radios };
  } catch (err) {
    console.error("[CanaisTV] Erro ao carregar catálogo de rádios:", err);
    if (radiosCache) {
      return { radios: radiosCache };
    }
    return { radios: [] };
  }
}
