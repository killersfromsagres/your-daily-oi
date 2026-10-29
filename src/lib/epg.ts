/**
 * Módulo de EPG (Guia de Programação Eletrônico) via XMLTV do BrazilTVEPG
 * Cache em memória de 6 horas, parsing nativo de XMLTV via regex e matching inteligente de canais
 */

import { loadCanais } from "./canais";

export interface ProgramaEPG {
  titulo: string;
  categoria?: string;
  horario?: string;
  fim?: string;
}

export interface CanalEPG {
  canal: string;
  atual?: ProgramaEPG;
  proximos?: ProgramaEPG[];
  indisponivel?: boolean;
}

export interface GradeItemAgora {
  canalNome: string;
  atual: ProgramaEPG | null;
  proximo: ProgramaEPG | null;
}

interface ParsedProgramme {
  start: number; // epoch ms UTC
  stop: number;  // epoch ms UTC
  title: string;
  desc?: string;
  category?: string;
}

interface EpgState {
  loadedAt: number;
  channels: Map<string, { id: string; name: string }>;
  programmesByChannel: Map<string, ParsedProgramme[]>;
  matchCache: Map<string, string | null>;
}

const CLARO_XML_URL = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/claro.xml";
const EPG_XML_URL = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/main/epg.xml";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

let cachedState: EpgState | null = null;
let loadPromise: Promise<EpgState | null> | null = null;

function unescapeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .trim();
}

function parseXmltvTimestamp(ts: string): number {
  const clean = ts.trim();
  if (clean.length < 14) return 0;
  const y = parseInt(clean.slice(0, 4), 10);
  const m = parseInt(clean.slice(4, 6), 10) - 1;
  const d = parseInt(clean.slice(6, 8), 10);
  const h = parseInt(clean.slice(8, 10), 10);
  const min = parseInt(clean.slice(10, 12), 10);
  const s = parseInt(clean.slice(12, 14), 10);

  let utc = Date.UTC(y, m, d, h, min, s);
  const tz = clean.slice(14).trim();
  if (tz && (tz.startsWith("+") || tz.startsWith("-"))) {
    const sign = tz[0] === "+" ? 1 : -1;
    const offHours = parseInt(tz.slice(1, 3), 10) || 0;
    const offMins = parseInt(tz.slice(3, 5), 10) || 0;
    const offsetMs = sign * (offHours * 60 + offMins) * 60 * 1000;
    utc -= offsetMs;
  }
  return utc;
}

function formatTimeBR(epochMs: number): string {
  if (!epochMs) return "";
  try {
    const d = new Date(epochMs);
    return d.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    const d = new Date(epochMs - 3 * 3600 * 1000);
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}

export function normalizeNomeCanal(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(hd|fhd|sd|4k|uhd)\b/g, "")
    .replace(/\bbrasil\b/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseXmltvContent(
  xmlText: string,
  channels: Map<string, { id: string; name: string }>,
  programmesByChannel: Map<string, ParsedProgramme[]>,
  isComplementary = false
) {
  const chanRegex = /<channel id="([^"]+)"[\s\S]*?<display-name[^>]*>([^<]*)<\/display-name>/g;
  const newChanIds = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = chanRegex.exec(xmlText)) !== null) {
    const id = unescapeXml(m[1]);
    const name = unescapeXml(m[2]);
    const normName = normalizeNomeCanal(name);

    if (isComplementary) {
      let alreadyExists = false;
      for (const existing of channels.values()) {
        if (normalizeNomeCanal(existing.name) === normName) {
          alreadyExists = true;
          break;
        }
      }
      if (!alreadyExists && !channels.has(id)) {
        channels.set(id, { id, name });
        newChanIds.add(id);
      }
    } else {
      if (!channels.has(id)) {
        channels.set(id, { id, name });
        newChanIds.add(id);
      }
    }
  }

  const progRegex =
    /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/g;

  while ((m = progRegex.exec(xmlText)) !== null) {
    const startStr = m[1];
    const stopStr = m[2];
    const chanId = unescapeXml(m[3]);
    const body = m[4];

    if (isComplementary && !newChanIds.has(chanId)) {
      continue;
    }

    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(body);
    if (!titleMatch) continue;
    const title = unescapeXml(titleMatch[1]);
    if (!title) continue;

    const descMatch = /<desc[^>]*>([^<]*)<\/desc>/i.exec(body);
    const desc = descMatch ? unescapeXml(descMatch[1]) : undefined;

    const catMatch = /<category[^>]*>([^<]*)<\/category>/i.exec(body);
    const category = catMatch ? unescapeXml(catMatch[1]) : undefined;

    const start = parseXmltvTimestamp(startStr);
    const stop = parseXmltvTimestamp(stopStr);

    let list = programmesByChannel.get(chanId);
    if (!list) {
      list = [];
      programmesByChannel.set(chanId, list);
    }
    list.push({
      start,
      stop,
      title,
      desc,
      category,
    });
  }
}

async function fetchXmlWithTimeout(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/xml, text/xml, */*",
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`[EPG] Falha ao baixar ${url}:`, err);
    return null;
  }
}

async function loadEpgData(): Promise<EpgState | null> {
  const channels = new Map<string, { id: string; name: string }>();
  const programmesByChannel = new Map<string, ParsedProgramme[]>();

  // 1. Fonte primária: claro.xml
  const claroXml = await fetchXmlWithTimeout(CLARO_XML_URL, 8000);
  if (claroXml) {
    parseXmltvContent(claroXml, channels, programmesByChannel, false);
  }

  // 2. Fonte complementar: epg.xml
  const epgXml = await fetchXmlWithTimeout(EPG_XML_URL, 8000);
  if (epgXml) {
    parseXmltvContent(epgXml, channels, programmesByChannel, true);
  }

  if (channels.size === 0) {
    return null;
  }

  // Ordena programas por horário de início
  for (const list of programmesByChannel.values()) {
    list.sort((a, b) => a.start - b.start);
  }

  return {
    loadedAt: Date.now(),
    channels,
    programmesByChannel,
    matchCache: new Map<string, string | null>(),
  };
}

async function getOrLoadEpgState(): Promise<EpgState | null> {
  const now = Date.now();
  if (cachedState && now - cachedState.loadedAt < CACHE_TTL_MS) {
    return cachedState;
  }

  if (!loadPromise) {
    loadPromise = loadEpgData()
      .then((state) => {
        if (state) {
          cachedState = state;
        }
        return state;
      })
      .finally(() => {
        loadPromise = null;
      });
  }

  return await loadPromise;
}

function matchChannelId(
  targetName: string,
  channels: Map<string, { id: string; name: string }>
): string | null {
  const normTarget = normalizeNomeCanal(targetName);
  if (!normTarget) return null;

  // 1. Busca exata
  for (const [id, c] of channels) {
    if (normTarget === normalizeNomeCanal(c.name) || normTarget === normalizeNomeCanal(id)) {
      return id;
    }
  }

  // 2. Prefixo com limite de palavra (ex.: "globo sp" -> "globo")
  for (const [id, c] of channels) {
    const cNorm = normalizeNomeCanal(c.name);
    const idNorm = normalizeNomeCanal(id);
    for (const cand of [cNorm, idNorm]) {
      if (cand.startsWith(normTarget + " ") || normTarget.startsWith(cand + " ")) {
        if (!normTarget.includes("news") && cand.includes("news")) continue;
        if (!normTarget.includes("kids") && cand.includes("kids")) continue;
        return id;
      }
    }
  }

  // 3. Includes bidirecional
  for (const [id, c] of channels) {
    const cNorm = normalizeNomeCanal(c.name);
    const idNorm = normalizeNomeCanal(id);
    for (const cand of [cNorm, idNorm]) {
      if (cand.includes(normTarget) || normTarget.includes(cand)) {
        if (!normTarget.includes("news") && cand.includes("news")) continue;
        if (!normTarget.includes("kids") && cand.includes("kids")) continue;
        return id;
      }
    }
  }

  return null;
}

/**
 * Retorna EPG do canal com o mesmo shape compatível
 */
export async function getCanalEPG(nomeCanal: string): Promise<CanalEPG> {
  try {
    const state = await getOrLoadEpgState();
    if (!state) {
      return { canal: nomeCanal, indisponivel: true };
    }

    const norm = normalizeNomeCanal(nomeCanal);
    let channelId = state.matchCache.get(norm);
    if (channelId === undefined) {
      channelId = matchChannelId(nomeCanal, state.channels);
      state.matchCache.set(norm, channelId);
    }

    if (!channelId) {
      return { canal: nomeCanal, indisponivel: true };
    }

    const progs = state.programmesByChannel.get(channelId);
    if (!progs || progs.length === 0) {
      return { canal: nomeCanal, indisponivel: true };
    }

    const now = Date.now();
    let curIdx = progs.findIndex((p) => p.start <= now && now < p.stop);
    if (curIdx === -1) {
      curIdx = progs.findIndex((p) => p.stop > now);
    }

    if (curIdx === -1) {
      return { canal: nomeCanal, indisponivel: true };
    }

    const cur = progs[curIdx];
    const nextProgs = progs.slice(curIdx + 1, curIdx + 9);

    const atual: ProgramaEPG = {
      titulo: cur.title,
      categoria: cur.category,
      horario: formatTimeBR(cur.start),
      fim: formatTimeBR(cur.stop),
    };

    const proximos: ProgramaEPG[] = nextProgs.map((p) => ({
      titulo: p.title,
      categoria: p.category,
      horario: formatTimeBR(p.start),
      fim: formatTimeBR(p.stop),
    }));

    return {
      canal: nomeCanal,
      atual,
      proximos,
    };
  } catch (err) {
    console.warn(`[EPG] Erro ao obter EPG para ${nomeCanal}:`, err);
    return { canal: nomeCanal, indisponivel: true };
  }
}

/**
 * Retorna o programa atual e próximo de todos os canais casados em uma chamada rápida
 */
export async function getGradeAgora(): Promise<GradeItemAgora[]> {
  try {
    const state = await getOrLoadEpgState();
    const canaisData = await loadCanais().catch(() => null);
    const canais = canaisData?.canais || [];
    const now = Date.now();

    if (!state) {
      return canais.map((c) => ({
        canalNome: c.nome,
        atual: null,
        proximo: null,
      }));
    }

    const grade: GradeItemAgora[] = [];

    for (const canal of canais) {
      const norm = normalizeNomeCanal(canal.nome);
      let channelId = state.matchCache.get(norm);
      if (channelId === undefined) {
        channelId = matchChannelId(canal.nome, state.channels);
        state.matchCache.set(norm, channelId);
      }

      let atual: ProgramaEPG | null = null;
      let proximo: ProgramaEPG | null = null;

      if (channelId) {
        const progs = state.programmesByChannel.get(channelId);
        if (progs && progs.length > 0) {
          let curIdx = progs.findIndex((p) => p.start <= now && now < p.stop);
          if (curIdx === -1) {
            curIdx = progs.findIndex((p) => p.stop > now);
          }
          if (curIdx !== -1) {
            const cur = progs[curIdx];
            atual = {
              titulo: cur.title,
              categoria: cur.category,
              horario: formatTimeBR(cur.start),
              fim: formatTimeBR(cur.stop),
            };
            const nxt = progs[curIdx + 1];
            if (nxt) {
              proximo = {
                titulo: nxt.title,
                categoria: nxt.category,
                horario: formatTimeBR(nxt.start),
                fim: formatTimeBR(nxt.stop),
              };
            }
          }
        }
      }

      grade.push({
        canalNome: canal.nome,
        atual,
        proximo,
      });
    }

    return grade;
  } catch (err) {
    console.warn("[EPG] Erro ao gerar grade agora:", err);
    return [];
  }
}
