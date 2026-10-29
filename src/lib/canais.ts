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
}

export interface RadioItem {
  id: string;
  nome: string;
  url: string;
  logo?: string;
}

const CANAIS_URL = "https://canais-saimo.pages.dev/catalogo.txt";
const RADIOS_URL = "https://canais-saimo.pages.dev/radios.txt";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

let canaisCache: CanalTV[] | null = null;
let canaisCacheTime = 0;
let canaisCategoriasCache: string[] = [];

let radiosCache: RadioItem[] | null = null;
let radiosCacheTime = 0;

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
    const res = await fetch(CANAIS_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/plain, */*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Falha HTTP ${res.status} ao obter catalogo.txt de canais`);
    }

    const text = await res.text();
    const canais = parseCanais(text);

    // Ordem preferencial de categorias
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
    // Adiciona as categorias restantes que não estavam na lista preferencial
    for (const r of foundCats) {
      categorias.push(r);
    }

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
