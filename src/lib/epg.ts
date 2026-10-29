/**
 * Módulo de EPG (Guia de Programação Eletrônico)
 * Faz scraping resiliente com cache em memória de 30 minutos
 */

export interface ProgramaEPG {
  titulo: string;
  categoria?: string;
  horario?: string;
}

export interface CanalEPG {
  canal: string;
  atual?: ProgramaEPG;
  proximos?: ProgramaEPG[];
  indisponivel?: boolean;
}

interface EpgCacheEntry {
  data: CanalEPG;
  expires: number;
}

const epgCache = new Map<string, EpgCacheEntry>();
const EPG_TTL_MS = 30 * 60 * 1000; // 30 minutos

// Mapeamento direto de canais conhecidos para o código do meuguia.tv
const KNOWN_CHANNEL_CODES: Record<string, string> = {
  globo: "GRD",
  "globo sp": "GRD",
  "globo rj": "GRD",
  band: "BAN",
  record: "REC",
  sbt: "SBT",
  redetv: "RTV",
  "rede tv": "RTV",
  cultura: "CUL",
  "tv cultura": "CUL",
  gazeta: "GAZ",
  "tv gazeta": "GAZ",
  canal21: "C21",
  "canal 21": "C21",
  futura: "FUT",
  sportv: "SPO",
  "sportv 2": "SP2",
  "sportv 3": "SP3",
  espn: "ESP",
  "espn 2": "ES2",
  "espn 3": "ES3",
  "espn 4": "ES4",
  "espn 5": "ES5",
  "espn 6": "ES6",
  premiere: "PFC",
  "premiere clubes": "PFC",
  "premiere 2": "PR2",
  "premiere 3": "PR3",
  "premiere 4": "PR4",
  combate: "CMB",
  "band sports": "BSP",
  bandsports: "BSP",
  globonews: "GNW",
  "globo news": "GNW",
  bandnews: "BNW",
  "band news": "BNW",
  cnn: "CNN",
  "cnn brasil": "CNN",
  "jovem pan news": "JPN",
  "record news": "RCN",
  cartoon: "CAR",
  "cartoon network": "CAR",
  discoverykids: "DKI",
  "discovery kids": "DKI",
  gloob: "GLB",
  disney: "DCH",
  "disney channel": "DCH",
  nickelodeon: "NIC",
  nick: "NIC",
  "nick jr": "NJR",
  tooncast: "TOC",
  hbo: "HBO",
  "hbo 2": "HB2",
  "hbo plus": "HBP",
  "hbo family": "HBF",
  "hbo signature": "HBS",
  telecinepipoca: "TC4",
  "telecine pipoca": "TC4",
  telecineaction: "TC2",
  "telecine action": "TC2",
  telecinepremium: "TC1",
  "telecine premium": "TC1",
  telecinetouch: "TC3",
  "telecine touch": "TC3",
  telecinefun: "TC5",
  "telecine fun": "TC5",
  telecinecult: "TC6",
  "telecine cult": "TC6",
  megapix: "MPX",
  tnt: "TNT",
  "tnt series": "TNS",
  "tnt novelas": "TNN",
  space: "SPA",
  warner: "WB",
  "warner channel": "WB",
  universal: "UNI",
  "universal tv": "UNI",
  sony: "SET",
  "sony channel": "SET",
  axn: "AXN",
  paramount: "PAR",
  "paramount network": "PAR",
  cinemax: "MAX",
  discovery: "DIS",
  "discovery channel": "DIS",
  history: "HIS",
  "history channel": "HIS",
  "history 2": "HI2",
  "nat geo": "NGC",
  "national geographic": "NGC",
  "animal planet": "ANP",
  "discovery turbo": "DTU",
  "discovery home & health": "HEA",
  "home & health": "HEA",
  "discovery science": "DSC",
  "discovery theater": "DHD",
  "discovery world": "DWO",
  "discovery id": "INV",
  investigacao: "INV",
  multishow: "MSW",
  gnt: "GNT",
  viva: "VIV",
  "a&e": "AE",
  ae: "AE",
  e: "EET",
  "e!": "EET",
  woohoo: "WOO",
  curta: "CUR",
  bis: "BIS",
  mtv: "MTV",
};

/**
 * Normaliza o nome do canal para cruzamento sem ruído
 */
function normalizeNomeCanal(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bhd\b/g, "")
    .replace(/\bfhd\b/g, "")
    .replace(/\b4k\b/g, "")
    .replace(/\bsd\b/g, "")
    .replace(/\bbrasil\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Encontra o código meuguia.tv para um canal
 */
function findChannelCode(nome: string): string | null {
  const norm = normalizeNomeCanal(nome);
  if (!norm) return null;

  // Busca exata
  if (KNOWN_CHANNEL_CODES[norm]) {
    return KNOWN_CHANNEL_CODES[norm];
  }

  // Busca por prefixo/inclusão
  for (const [key, code] of Object.entries(KNOWN_CHANNEL_CODES)) {
    if (norm === key || norm.startsWith(`${key} `) || key.startsWith(`${norm} `)) {
      return code;
    }
  }

  // Busca sem espaços
  const noSpace = norm.replace(/\s+/g, "");
  if (KNOWN_CHANNEL_CODES[noSpace]) {
    return KNOWN_CHANNEL_CODES[noSpace];
  }

  return null;
}

/**
 * Raspa a programação do canal no meuguia.tv
 */
export async function getCanalEPG(nomeCanal: string): Promise<CanalEPG> {
  const normKey = normalizeNomeCanal(nomeCanal);
  const now = Date.now();

  const cached = epgCache.get(normKey);
  if (cached && cached.expires > now) {
    return cached.data;
  }

  const code = findChannelCode(nomeCanal);
  if (!code) {
    const res: CanalEPG = { canal: nomeCanal, indisponivel: true };
    epgCache.set(normKey, { data: res, expires: now + EPG_TTL_MS });
    return res;
  }

  try {
    const url = `https://meuguia.tv/programacao/canal/${code}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const errRes: CanalEPG = { canal: nomeCanal, indisponivel: true };
      epgCache.set(normKey, { data: errRes, expires: now + 5 * 60 * 1000 });
      return errRes;
    }

    const html = await res.text();

    // Extrai programas listados no HTML do meuguia.tv
    // Estrutura típica de cada item:
    // <li>... <div class='lileft time'>21:30</div> ... <h2>Título</h2> <h3>Gênero</h3> ... [<div class="noar">NO AR</div>]
    const itemRegex =
      /<li[^>]*>[\s\S]*?(?:<div[^>]*class=['"][^'"]*time[^'"]*['"][^>]*>([^<]+)<\/div>)?[\s\S]*?<h2>([^<]+)<\/h2>(?:[\s\S]*?<h3>([^<]+)<\/h3>)?([\s\S]*?)(?:<\/li>|(?=<li))/gi;

    const programas: Array<{
      titulo: string;
      categoria?: string;
      horario?: string;
      isNoAr?: boolean;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(html)) !== null) {
      const horario = match[1]?.trim();
      const titulo = match[2]?.trim();
      const categoria = match[3]?.trim();
      const rest = match[4] || "";
      const isNoAr = rest.includes("noar") || rest.includes("NO AR");

      if (titulo && !titulo.startsWith("<")) {
        programas.push({
          titulo,
          categoria,
          horario,
          isNoAr,
        });
      }
      if (programas.length >= 10) break;
    }

    if (programas.length === 0) {
      const emptyRes: CanalEPG = { canal: nomeCanal, indisponivel: true };
      epgCache.set(normKey, { data: emptyRes, expires: now + 15 * 60 * 1000 });
      return emptyRes;
    }

    // Identifica o programa "NO AR" ou assume o primeiro item
    let currentIndex = programas.findIndex((p) => p.isNoAr);
    if (currentIndex === -1) currentIndex = 0;

    const atual = programas[currentIndex];
    const proximos = programas.slice(currentIndex + 1, currentIndex + 5);

    const result: CanalEPG = {
      canal: nomeCanal,
      atual: {
        titulo: atual.titulo,
        categoria: atual.categoria,
        horario: atual.horario,
      },
      proximos: proximos.map((p) => ({
        titulo: p.titulo,
        categoria: p.categoria,
        horario: p.horario,
      })),
    };

    epgCache.set(normKey, { data: result, expires: now + EPG_TTL_MS });
    return result;
  } catch {
    const fallbackRes: CanalEPG = { canal: nomeCanal, indisponivel: true };
    epgCache.set(normKey, { data: fallbackRes, expires: now + 5 * 60 * 1000 });
    return fallbackRes;
  }
}
