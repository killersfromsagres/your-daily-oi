import type { LiveChannel, LiveStreamSource, RadioItem, ChannelsResponse, EpgProgram } from "./live-types";

const SAIMO_CANAIS = (process.env.SAIMO_CANAIS ?? "https://canais-saimo.pages.dev").replace(/\/$/, "");

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let channelsCache: ChannelsResponse | null = null;
let channelsCacheTime = 0;
const CHANNELS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 horas

let radiosCache: RadioItem[] | null = null;
let radiosCacheTime = 0;

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "canal";
}

function detectLiveFormat(url: string, chave?: string | null): "hls" | "ts" | "dash" | "mp4" {
  if (chave || /\.mpd(\?|$)/i.test(url)) return "dash";
  if (/\.ts(\?|$)/i.test(url)) return "ts";
  if (/\.m3u8(\?|$)/i.test(url) || /\.txt(\?|$)/i.test(url)) return "hls";
  return "hls";
}

/**
 * Parser tolerante para o formato chave: valor de catalogo.txt do Saimo
 */
export function parseCatalogoText(text: string): ChannelsResponse {
  const canais: LiveChannel[] = [];
  const categoriasSet = new Set<string>();

  let currentChannel: LiveChannel | null = null;
  let currentSource: LiveStreamSource | null = null;

  const lines = text.split(/\r?\n/);

  const finalizeChannel = () => {
    if (currentChannel && currentChannel.fontes.length > 0) {
      if (!currentChannel.categoria) {
        currentChannel.categoria = "Geral";
      }
      categoriasSet.add(currentChannel.categoria);
      canais.push(currentChannel);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    if (!val) continue;

    if (key === "canal") {
      finalizeChannel();
      currentSource = null;
      currentChannel = {
        id: slugify(val),
        nome: val,
        logo: "",
        categoria: "",
        fontes: [],
      };
      continue;
    }

    if (!currentChannel) continue;

    if (key === "categoria") {
      currentChannel.categoria = val;
    } else if (key === "logo") {
      currentChannel.logo = val;
    } else if (key === "fonte") {
      currentSource = {
        url: val,
        formato: detectLiveFormat(val),
        qualidade: undefined,
        nome: undefined,
        referer: null,
        agente: null,
        chave: null,
      };
      currentChannel.fontes.push(currentSource);
    } else if (currentSource) {
      if (key === "qualidade") {
        currentSource.qualidade = val;
      } else if (key === "nome") {
        currentSource.nome = val;
      } else if (key === "referer") {
        currentSource.referer = val;
      } else if (key === "agente") {
        currentSource.agente = val;
      } else if (key === "chave") {
        currentSource.chave = val;
        currentSource.formato = "dash";
      }
    }
  }

  finalizeChannel();

  // Deduplicação de IDs se necessário
  const idMap = new Map<string, number>();
  for (const c of canais) {
    const count = (idMap.get(c.id) ?? 0) + 1;
    idMap.set(c.id, count);
    if (count > 1) {
      c.id = `${c.id}-${count}`;
    }
  }

  const categorias = Array.from(categoriasSet).sort((a, b) => {
    const priority = ["TV Aberta", "Filmes e Séries", "Esportes", "Notícias", "Infantil", "Documentários", "Variedades", "Músicas", "24 Horas"];
    const idxA = priority.indexOf(a);
    const idxB = priority.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return {
    atualizado_em: new Date().toISOString().split("T")[0],
    categorias,
    canais,
  };
}

/**
 * Carrega a lista completa de canais com cache de 12h
 */
export async function loadChannels(): Promise<ChannelsResponse> {
  const now = Date.now();
  if (channelsCache && now - channelsCacheTime < CHANNELS_CACHE_TTL) {
    return channelsCache;
  }

  const url = `${SAIMO_CANAIS}/catalogo.txt`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/plain, */*",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Status ${res.status} ao obter canais`);
    }

    const text = await res.text();
    const parsed = parseCatalogoText(text);

    channelsCache = parsed;
    channelsCacheTime = now;
    return parsed;
  } catch (error) {
    console.error("Erro ao carregar catálogo de canais do Saimo:", error);
    if (channelsCache) return channelsCache;
    return {
      atualizado_em: new Date().toISOString().split("T")[0],
      categorias: [],
      canais: [],
    };
  }
}

/**
 * Parser tolerante para radios.txt (Nome|URL|logo)
 */
export function parseRadiosText(text: string): RadioItem[] {
  const radios: RadioItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|");
    if (parts.length >= 2 && parts[0] && parts[1]) {
      radios.push({
        nome: parts[0].trim(),
        url: parts[1].trim(),
        logo: parts[2]?.trim() || undefined,
      });
    }
  }
  return radios;
}

/**
 * Carrega a lista de rádios com cache
 */
export async function loadRadios(): Promise<RadioItem[]> {
  const now = Date.now();
  if (radiosCache && now - radiosCacheTime < CHANNELS_CACHE_TTL) {
    return radiosCache;
  }

  const url = `${SAIMO_CANAIS}/radios.txt`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/plain, */*",
      },
      redirect: "follow",
    });

    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    const parsed = parseRadiosText(text);
    radiosCache = parsed;
    radiosCacheTime = now;
    return parsed;
  } catch (err) {
    console.error("Erro ao obter rádios:", err);
    return radiosCache || [];
  }
}

/**
 * Gera guia EPG dinâmico para os canais
 */
export async function getEpgData(canalId?: string): Promise<Record<string, EpgProgram[]>> {
  const now = new Date();
  const currentHour = now.getHours();

  // Exemplo de grade dinâmica baseada no horário atual
  const schedule: Record<string, EpgProgram[]> = {};
  const mockPrograms = [
    { title: "Programação ao Vivo", desc: "Transmissão contínua em tempo real da emissora oficial." },
    { title: "Jornal do Dia", desc: "As principais notícias do Brasil e do mundo com cobertura ao vivo." },
    { title: "Sessão Especial de Cinema", desc: "Grandes sucessos do cinema nacional e internacional." },
    { title: "Mundo Esportivo", desc: "Debates, gols, notícias e análises esportivas em tempo real." },
    { title: "Documentário Exclusivo", desc: "Grandes reportagens, história, natureza e ciência." },
    { title: "Série Especial", desc: "Episódios completos dos maiores sucessos da televisão." },
  ];

  const formatHour = (h: number) => `${String((h + 24) % 24).padStart(2, "0")}:00`;

  const channelsList = channelsCache?.canais ?? [];
  const targetChannels = canalId ? channelsList.filter((c) => c.id === canalId) : channelsList.slice(0, 50);

  for (const c of targetChannels) {
    const progIdx = (c.nome.length + currentHour) % mockPrograms.length;
    schedule[c.id] = [
      {
        canalId: c.id,
        canalNome: c.nome,
        titulo: mockPrograms[progIdx].title,
        inicio: formatHour(currentHour),
        fim: formatHour(currentHour + 1),
        sinopse: mockPrograms[progIdx].desc,
        aoVivo: true,
      },
      {
        canalId: c.id,
        canalNome: c.nome,
        titulo: mockPrograms[(progIdx + 1) % mockPrograms.length].title,
        inicio: formatHour(currentHour + 1),
        fim: formatHour(currentHour + 2),
        sinopse: mockPrograms[(progIdx + 1) % mockPrograms.length].desc,
        aoVivo: false,
      },
      {
        canalId: c.id,
        canalNome: c.nome,
        titulo: mockPrograms[(progIdx + 2) % mockPrograms.length].title,
        inicio: formatHour(currentHour + 2),
        fim: formatHour(currentHour + 3),
        sinopse: mockPrograms[(progIdx + 2) % mockPrograms.length].desc,
        aoVivo: false,
      },
    ];
  }

  return schedule;
}
