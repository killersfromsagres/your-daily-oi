// src/lib/jogos.ts — server, ESPN scoreboard fixtures + verified Brazilian broadcasts.
import { loadCanais } from "./canais";
import { localizarJogosNaGradeEPG } from "./epg";
import {
  LIGAS_FUTEBOL, addDaysUTC, brBroadcastsFromESPN, dataBrasilia, fixturePriority,
  isValidSportsDate, normalizeSoccerName, parseESPNFixture,
  type ESPNEvent, type JogoBrasileirao, type LigaFutebol,
} from "./jogos-match";

export type { JogoBrasileirao } from "./jogos-match";

export interface JogosHojeResponse {
  atualizadoEm: string;
  dataLocal: string;
  jogos: JogoBrasileirao[];
  fontesConsultadas: number;
  ligasIndisponiveis: string[];
  parcial: boolean;
  origem: string;
  erro?: string;
}
type CacheEntry = { expires: number; value: JogosHojeResponse };
const fixtureCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<JogosHojeResponse>>();
const TTL_MS = 2 * 60_000;
const STALE_MS = 24 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 6500;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/";

function getConfiguredBroadcasters(): Record<string, string | string[]> {
  try {
    const raw = typeof process !== "undefined" ? process.env["ZANG_JOGOS_CANAIS_JSON"] : undefined;
    if (!raw || raw.length > 65_000) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^[a-z0-9.:|_-]{3,130}$/i.test(key)) continue;
      if (typeof value === "string" && value.length <= 100) result[key] = value;
      if (Array.isArray(value)) {
        const names = value.filter((item): item is string =>
          typeof item === "string" && item.length <= 100).slice(0, 5);
        if (names.length) result[key] = names;
      }
    }
    return result;
  } catch (error) {
    console.warn("[Sports] Configuração de transmissões inválida", error);
    return {};
  }
}
function matchChannel(
  name: string,
  channels: { id: string; nome: string; logo?: string; fontes: { url: string }[] }[],
): { id: string; nome: string; logo?: string } | null {
  const normalized = normalizeSoccerName(name).replace(/\b(hd|fhd|4k|uhd)\b/g, "").trim();
  if (!normalized) return null;
  // Match by exact slug or normalized name; "ESPN+" is NOT "ESPN".
  const matched = channels.find(ch => ch.fontes.length > 0 && (
    ch.id.toLowerCase() === name.toLowerCase() ||
    normalizeSoccerName(ch.nome) === normalized
  ));
  return matched ? { id: matched.id, nome: matched.nome, ...(matched.logo ? { logo: matched.logo } : {}) } : null;
}
async function fetchFixturesForLeague(liga: LigaFutebol, date: string): Promise<{
  liga: LigaFutebol; events: ESPNEvent[];
}> {
  // Scoreboard 'dates' supports a single YYYYMMDD for soccer, not date ranges.
  const url = ESPN_BASE + encodeURIComponent(liga.id) + "/scoreboard?dates=" +
    date.replace(/-/g, "") + "&limit=150";
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ZangFlix-Sports/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(liga.id + ": HTTP " + res.status);
  const parsed: unknown = await res.json();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Resposta ESPN inválida");
  const events = (parsed as { events?: ESPNEvent[] }).events;
  if (events !== undefined && !Array.isArray(events)) throw new Error("Lista de eventos inválida");
  return { liga, events: events || [] };
}
async function fetchAllLeagues(date: string): Promise<{
  items: { event: ESPNEvent; liga: LigaFutebol }[];
  successes: number; failed: string[];
}> {
  const items: { event: ESPNEvent; liga: LigaFutebol }[] = [];
  const failed: string[] = [];
  let successes = 0;
  // Bound concurrency to reduce provider overload and Cloudflare connection caps.
  for (let i = 0; i < LIGAS_FUTEBOL.length; i += 5) {
    const batch = LIGAS_FUTEBOL.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(liga => fetchFixturesForLeague(liga, date)));
    for (const [index, result] of results.entries()) {
      const league = batch[index];
      if (!league) continue;
      if (result.status === "fulfilled") {
        successes++;
        for (const event of result.value.events) items.push({ event, liga: result.value.liga });
      } else {
        failed.push(league.id);
        console.warn("[Sports] Falha ESPN", league.id, String(result.reason).slice(0, 150));
      }
    }
  }
  return { items, successes, failed };
}
async function annotateBroadcasts(
  fixtures: { item: JogoBrasileirao; raw: ESPNEvent }[],
  date: string,
): Promise<JogoBrasileirao[]> {
  const matches = fixtures.map(x => x.item);
  if (!matches.length) return matches;
  try {
    const available = (await loadCanais()).canais;
    const config = getConfiguredBroadcasters();
    const epg = await Promise.race([
      localizarJogosNaGradeEPG(matches, available).catch(() =>
        new Map<string, { id: string; nome: string; logo?: string }>()),
      new Promise<Map<string, { id: string; nome: string; logo?: string }>>(
        resolve => setTimeout(() => resolve(new Map()), 3500)
      ),
    ]);
    for (const fixture of fixtures) {
      const game = fixture.item;
      const configured = config[game.id] ||
        config[date + "|" + normalizeSoccerName(game.casa).replace(/ /g, "-") +
          "|" + normalizeSoccerName(game.fora).replace(/ /g, "-")];
      const manual = (Array.isArray(configured) ? configured : configured ? [configured] : []);
      const sourceNames = brBroadcastsFromESPN(fixture.raw);
      // Strict priority: explicit event-level configuration > Brazilian EPG > 
      // Brazilian geo-broadcast metadata. US rights are not used.
      let resolved: { id: string; nome: string; logo?: string } | null = null;
      let origin: JogoBrasileirao["origemTransmissao"];
      for (const name of manual) {
        resolved = matchChannel(name, available);
        if (resolved) { origin = "configuracao"; break; }
      }
      if (!resolved && epg.has(game.id)) {
        resolved = epg.get(game.id)!;
        origin = "epg";
      }
      if (!resolved) for (const name of sourceNames) {
        resolved = matchChannel(name, available);
        if (resolved) { origin = "grade-br"; break; }
      }
      if (resolved) {
        game.canalId = resolved.id;
        game.canalNome = resolved.nome;
        game.canalLogo = resolved.logo || null;
        game.transmissao = "confirmada";
        if (origin) game.origemTransmissao = origin;
      }
    }
  } catch (error) {
    console.warn("[Sports] Não foi possível cruzar EPG e canais", error);
  }
  return matches;
}
async function getFresh(date: string): Promise<JogosHojeResponse> {
  const { items, successes, failed } = await fetchAllLeagues(date);
  if (successes === 0) throw new Error("Nenhum provedor de agenda respondeu");
  const deduped = new Map<string, { item: JogoBrasileirao; raw: ESPNEvent }>();
  for (const { event, liga } of items) {
    const item = parseESPNFixture(event, liga, date);
    if (item && !deduped.has(item.id)) deduped.set(item.id, { item, raw: event });
  }
  const games = await annotateBroadcasts([...deduped.values()], date);
  games.sort((a,b) => {
    const timeA = Date.parse(a.inicioIso), timeB = Date.parse(b.inicioIso);
    return timeA - timeB || fixturePriority(b) - fixturePriority(a);
  });
  return {
    atualizadoEm: new Date().toISOString(),
    dataLocal: date, jogos: games,
    fontesConsultadas: successes, ligasIndisponiveis: failed, parcial: failed.length > 0,
    origem: "ESPN Soccer Scoreboard + EPG Brasil",
  };
}

export async function getJogosHoje(requestedDate?: string): Promise<JogosHojeResponse> {
  const today = dataBrasilia();
  const date = requestedDate || today;
  // Public API bounded to the near future and previous week. Invalid dates are
  // rejected by HTTP handler; this check is a second layer for direct calls.
  if (!isValidSportsDate(date) || date < addDaysUTC(today, -7) ||
      date > addDaysUTC(today, 15)) {
    throw new RangeError("Data fora do intervalo permitido");
  }
  const cached = fixtureCache.get(date);
  if (cached && Date.now() < cached.expires) return cached.value;
  const pending = inflight.get(date);
  if (pending) return pending;
  const work = getFresh(date).then(value => {
    fixtureCache.set(date, { value, expires: Date.now() + TTL_MS });
    if (fixtureCache.size > 28) {
      for (const key of fixtureCache.keys()) if (key !== date) fixtureCache.delete(key);
    }
    return value;
  }).catch(error => {
    if (cached && Date.now() - Date.parse(cached.value.atualizadoEm) < STALE_MS) {
      return { ...cached.value, parcial: true, erro: "Dados em cache: fonte de jogos indisponível" };
    }
    console.error("[Sports] Agenda indisponível", error);
    return {
      atualizadoEm: new Date().toISOString(), dataLocal: date,
      jogos: [], fontesConsultadas: 0, ligasIndisponiveis: LIGAS_FUTEBOL.map(l => l.id),
      parcial: true, origem: "ESPN Soccer Scoreboard",
      erro: "Não foi possível consultar os jogos. Tente atualizar em instantes.",
    };
  }).finally(() => { inflight.delete(date); });
  inflight.set(date, work);
  return work;
}
