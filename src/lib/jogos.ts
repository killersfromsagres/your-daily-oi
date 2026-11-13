// src/lib/jogos.ts — server, ESPN scoreboard fixtures + verified Brazilian broadcasts.
import { loadCanais } from "./canais";
import { localizarJogosNaGradeEPG } from "./epg";
import { matchBrazilianBroadcastChannel } from "./broadcast-match";
import { fetchSportsDbFixtures, mergeProviderFixtures } from "./football-backup";
import { getBrazilianSportsDbBroadcasts } from "./football-broadcasts";
import { sameBroadcastFixture, verifiedBroadcastEvidence } from "./broadcast-verified";
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
const TTL_MS = 90_000;
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
// Fixtures that kick off after 21:00 Brasília may be assigned the following
// UTC day by ESPN. Fetch that extra day for South American competitions only.
const UTC_ROLLOVER_LEAGUES = new Set([
  "bra.1", "bra.2", "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana",
]);
async function fetchScoreboardDay(liga: LigaFutebol, date: string): Promise<{
  events: ESPNEvent[]; logo: string | null;
}> {
  const url = ESPN_BASE + encodeURIComponent(liga.id) + "/scoreboard?dates=" +
    date.replace(/-/g, "") + "&limit=150";
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ZangFlix-Sports/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(liga.id + " " + date + ": HTTP " + res.status);
  const parsed: unknown = await res.json();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Resposta ESPN inválida");
  const feed = parsed as { events?: ESPNEvent[]; leagues?: Array<{logo?: string; logos?: Array<{href?:string}>}> };
  if (feed.events !== undefined && !Array.isArray(feed.events)) throw new Error("Lista de eventos inválida");
  const candidate = feed.leagues?.[0]?.logos?.[0]?.href || feed.leagues?.[0]?.logo || null;
  let logo: string | null = null;
  if (candidate) {
    try { const u=new URL(candidate); if (u.protocol==="https:") logo=u.href; } catch {}
  }
  return { events: feed.events || [], logo };
}
async function fetchFixturesForLeague(liga: LigaFutebol, date: string): Promise<{
  liga: LigaFutebol; events: ESPNEvent[]; leagueLogo: string | null;
  followupFailed: boolean;
}> {
  const primary=await fetchScoreboardDay(liga,date);
  const byId=new Map<string,ESPNEvent>();
  for (const event of primary.events) if(event.id)byId.set(event.id,event);
  let followupFailed=false;
  let leagueLogo=primary.logo;
  if (UTC_ROLLOVER_LEAGUES.has(liga.id)) {
    // Sequential per league: keep max five concurrent connections in Workers.
    try {
      const secondary=await fetchScoreboardDay(liga,addDaysUTC(date,1));
      for (const event of secondary.events) if(event.id && !byId.has(event.id))byId.set(event.id,event);
      if(!leagueLogo)leagueLogo=secondary.logo;
    } catch (error) {
      followupFailed=true;
      console.warn("[Sports] Falha na verificação de jogos após virada UTC",liga.id,String(error).slice(0,120));
    }
  }
  return { liga,events:[...byId.values()],leagueLogo,followupFailed };
}
async function fetchAllLeagues(date: string, leagues: readonly LigaFutebol[] = LIGAS_FUTEBOL): Promise<{
  items: { event: ESPNEvent; liga: LigaFutebol; leagueLogo: string | null }[];
  successes: number; failed: string[];
}> {
  const items: { event: ESPNEvent; liga: LigaFutebol; leagueLogo: string | null }[] = [];
  const failed: string[] = [];
  let successes = 0;
  // Bound concurrency to reduce provider overload and Cloudflare connection caps.
  for (let i = 0; i < leagues.length; i += 5) {
    const batch = leagues.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(liga => fetchFixturesForLeague(liga, date)));
    for (const [index, result] of results.entries()) {
      const league = batch[index];
      if (!league) continue;
      if (result.status === "fulfilled") {
        successes++;
        for (const event of result.value.events) items.push({ event, liga: result.value.liga, leagueLogo: result.value.leagueLogo });
        if (result.value.followupFailed) failed.push(league.id + "-utc");
      } else {
        failed.push(league.id);
        console.warn("[Sports] Falha ESPN", league.id, String(result.reason).slice(0, 150));
      }
    }
  }
  return { items, successes, failed };
}
/**
 * ESPN scoreboard sometimes omits geoBroadcasts for individual Serie A matches.
 * Check each fixture's detail, using only explicit BR region/market metadata.
 * Never infer a carrier from the league itself.
 */
async function loadBrazilBroadcastDetails(
  fixtures: { item: JogoBrasileirao; raw: ESPNEvent }[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const missing = fixtures.filter(x => brBroadcastsFromESPN(x.raw).length === 0)
    .sort((a, b) => fixturePriority(b.item) - fixturePriority(a.item))
    .slice(0, 16);
  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    const responses = await Promise.allSettled(batch.map(async ({ item }) => {
      const eventId = item.id.split(":").at(-1);
      if (!eventId || !/^[0-9]+$/.test(eventId)) return [] as string[];
      const url = ESPN_BASE + encodeURIComponent(item.ligaId) + "/summary?event=" + encodeURIComponent(eventId);
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3200),
      });
      if (!response.ok) return [] as string[];
      const detail = await response.json() as {
        header?: { competitions?: ESPNEvent["competitions"] };
      };
      return brBroadcastsFromESPN(detail.header?.competitions ? { competitions: detail.header.competitions } : {});
    }));
    responses.forEach((response, index) => {
      const item = batch[index];
      if (item && response.status === "fulfilled" && response.value.length) {
        result.set(item.item.id, response.value);
      }
    });
  }
  return result;
}

async function annotateBroadcasts(
  fixtures: { item: JogoBrasileirao; raw: ESPNEvent }[],
  date: string,
  detailedBroadcastsTask: Promise<Map<string, string[]>>,
  backupBroadcastsTask: Promise<Map<string,string[]>>,
): Promise<JogoBrasileirao[]> {
  const matches = fixtures.map(x => x.item);
  if (!matches.length) return matches;
  const config = getConfiguredBroadcasters();
  let available: Awaited<ReturnType<typeof loadCanais>>["canais"] = [];
  let epg = new Map<string, { id: string; nome: string; logo?: string }>();
  // EPG and ESPN match summaries are independent and should not queue sequentially.
  const epgTask = (async () => {
    try {
      available = (await loadCanais()).canais;
      epg = await Promise.race([
        localizarJogosNaGradeEPG(matches, available).catch(() =>
          new Map<string, { id: string; nome: string; logo?: string }>()),
        new Promise<Map<string, { id: string; nome: string; logo?: string }>>(
          resolve => setTimeout(() => resolve(new Map()), 9500)
        ),
      ]);
    } catch (error) {
      console.warn("[Sports] EPG ou catálogo indisponível", error);
    }
  })();
  const [detailedBroadcasts,backupBroadcasts]=await Promise.all([
    detailedBroadcastsTask.catch(()=>new Map<string,string[]>()),
    backupBroadcastsTask.catch(()=>new Map<string,string[]>()),
  ]);
  await epgTask;

  for (const fixture of fixtures) {
    const game = fixture.item;
    const configured = config[game.id] ||
      config[date + "|" + normalizeSoccerName(game.casa).replace(/ /g, "-") +
        "|" + normalizeSoccerName(game.fora).replace(/ /g, "-")];
    const manual = (Array.isArray(configured) ? configured : configured ? [configured] : []);
    const verified = verifiedBroadcastEvidence(game);
    const sourceNames = [...new Set([
      ...brBroadcastsFromESPN(fixture.raw),
      ...(detailedBroadcasts.get(game.id) || []),
      ...(backupBroadcasts.get(game.id) || []),
      ...(verified?.names || []),
    ])];
    // Store rights metadata independently of available player links.
    const announced = manual.length ? manual : sourceNames;
    const epgChannel = epg.get(game.id);
    const names = [...new Set([...announced, ...(epgChannel ? [epgChannel.nome] : [])]
      .map(name => name.trim()).filter(Boolean))];
    if (names.length) game.canaisTransmissao = names;

    // Explicit match-level configuration > EPG > Brazil-only ESPN metadata.
    let resolved: { id: string; nome: string; logo?: string } | null = null;
    let origin: JogoBrasileirao["origemTransmissao"];
    for (const name of manual) {
      resolved = matchBrazilianBroadcastChannel(name, available);
      if (resolved) { origin = "configuracao"; break; }
    }
    if (!resolved && epgChannel && available.some(ch=>ch.id===epgChannel.id&&ch.fontes?.length>0)) {
      resolved = epgChannel;
      origin = "epg";
    }
    if (!resolved) for (const name of sourceNames) {
      resolved = matchBrazilianBroadcastChannel(name, available);
      if (resolved) { origin = verified?.names.includes(name) ? "verificada" : "grade-br"; break; }
    }
    // Preserve each verified in-catalog option so viewers can choose a
    // specific broadcaster, not a generic TV entry or guessed URL.
    const listed = [...new Set([...manual,...sourceNames])];
    const alternatives = [ ...(epgChannel ? [epgChannel] : []),
      ...listed.map(name=>matchBrazilianBroadcastChannel(name,available))
        .filter((ch): ch is NonNullable<typeof ch> => ch!==null),
    ];
    const ids = new Set<string>();
    const validAlternatives = alternatives.filter(ch=>{
      if(ids.has(ch.id))return false;
      ids.add(ch.id);
      return available.some(c=>c.id===ch.id&&c.fontes?.length>0);
    });
    if(validAlternatives.length)game.canaisDisponiveis=validAlternatives;
    if (resolved) {
      game.canalId = resolved.id;
      game.canalNome = resolved.nome;
      game.canalLogo = resolved.logo || null;
      game.transmissao = "confirmada";
      if (origin) game.origemTransmissao = origin;
    }
  }
  return matches;
}
async function getFresh(date: string): Promise<JogosHojeResponse> {
  // Independent, keyless schedule provider: fixes "0 jogos" during national-team
  // breaks and when the ESPN feed omits competitions that play that day.
  // Kick both providers off together so the fallback adds almost no latency.
  const backupTask=fetchSportsDbFixtures(date).catch(error=>{
    console.warn("[Sports] Agenda secundária indisponível",String(error).slice(0,150));
    return null;
  });
  const { items, successes, failed } = await fetchAllLeagues(date);
  const backup = await backupTask;
  if (successes === 0 && backup === null)
    throw new Error("Nenhum provedor de agenda respondeu");
  const deduped = new Map<string, { item: JogoBrasileirao; raw: ESPNEvent }>();
  for (const { event, liga, leagueLogo } of items) {
    const item = parseESPNFixture(event, liga, date);
    if (item && !deduped.has(item.id)) {
      item.ligaLogo = leagueLogo;
      deduped.set(item.id, { item, raw: event });
    }
  }
  const primary=[...deduped.values()];
  const combined=mergeProviderFixtures(primary.map(x=>x.item),backup||[]);
  const originalById=new Map(primary.map(x=>[x.item.id,x.raw]));
  const fixtures=combined.map(item=>({item,raw:originalById.get(item.id)||({} as ESPNEvent)}));
  const brazilianBroadcasters=loadBrazilBroadcastDetails(primary);
  // TheSportsDB event IDs disappear when an identical ESPN fixture wins the
  // deduplication. Query the original backup IDs and transfer the broadcaster
  // evidence to a matching ESPN fixture only when both teams + kickoff agree.
  const backupBroadcasts=getBrazilianSportsDbBroadcasts(backup||[]).then(found=>{
    for (const game of combined) {
      if(found.has(game.id))continue;
      const counterpart=(backup||[]).find(item=>sameBroadcastFixture(game,item));
      if(counterpart) {
        const channels=found.get(counterpart.id);
        if(channels?.length)found.set(game.id,channels);
      }
    }
    return found;
  });
  const games = await annotateBroadcasts(fixtures, date, brazilianBroadcasters, backupBroadcasts);
  games.sort((a,b) => {
    const timeA = Date.parse(a.inicioIso), timeB = Date.parse(b.inicioIso);
    return timeA - timeB || fixturePriority(b) - fixturePriority(a);
  });
  return {
    atualizadoEm: new Date().toISOString(),
    dataLocal: date, jogos: games,
    fontesConsultadas: successes + (backup === null ? 0 : 1),
    ligasIndisponiveis: failed,
    parcial: failed.length > 0 || backup === null,
    origem: "ESPN Soccer + TheSportsDB + EPG Brasil",
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


/** Lightweight scoreboard refresh, separate from the slower channel/EPG enrichment.
 * Browsers ask for leagues with live or near-kickoff matches every 25-30 seconds.
 * The full agenda continues discovering new games in every covered competition.
 */
export interface PlacaresAoVivoResponse {
  dataLocal: string;
  atualizadoEm: string;
  jogos: JogoBrasileirao[];
  fontesConsultadas: number;
  ligasIndisponiveis: string[];
  parcial: boolean;
}
const scoreCache = new Map<string, { expires: number; value: PlacaresAoVivoResponse }>();
const scoreInflight = new Map<string, Promise<PlacaresAoVivoResponse>>();
export async function getJogosPlacares(
  requestedDate?: string,
  requestedLeagues?: readonly string[],
): Promise<PlacaresAoVivoResponse> {
  const today = dataBrasilia();
  const date = requestedDate || today;
  if (!isValidSportsDate(date) || date < addDaysUTC(today, -7) ||
      date > addDaysUTC(today, 15)) {
    throw new RangeError("Data fora do intervalo permitido");
  }

  const allowed = new Set<string>(LIGAS_FUTEBOL.map(x => x.id));
  const ids = [...new Set((requestedLeagues || []).filter(id => allowed.has(id)))].sort();
  const selected = ids.length ? LIGAS_FUTEBOL.filter(l => ids.includes(l.id)) : LIGAS_FUTEBOL;
  const key = date + "|" + (ids.join(",") || "all");
  const current = scoreCache.get(key);
  if (current && Date.now() < current.expires) return current.value;
  const pending = scoreInflight.get(key);
  if (pending) return pending;

  const work = (async (): Promise<PlacaresAoVivoResponse> => {
    const { items, successes, failed } = await fetchAllLeagues(date, selected);
    if (!successes) throw new Error("Provedor de placares indisponível");

    const previous = new Map((fixtureCache.get(date)?.value.jogos || []).map(g => [g.id, g]));
    const byId = new Map<string, JogoBrasileirao>();
    for (const { event, liga, leagueLogo } of items) {
      const parsed = parseESPNFixture(event, liga, date);
      if (!parsed) continue;
      parsed.ligaLogo = leagueLogo;
      const older = previous.get(parsed.id);
      if (older?.canalId) {
        parsed.canalId = older.canalId;
        parsed.canalNome = older.canalNome;
        parsed.canalLogo = older.canalLogo;
        parsed.transmissao = older.transmissao;
        if (older.origemTransmissao) parsed.origemTransmissao = older.origemTransmissao;
      }
      const announced = brBroadcastsFromESPN(event);
      parsed.canaisTransmissao = older?.canaisTransmissao?.length ?
        older.canaisTransmissao : announced;
      byId.set(parsed.id, parsed);
    }

    // A fixture discovered on the fast feed can already carry BR-specific rights data.
    // Resolve only that explicit metadata; never assign a channel by league alone.
    const unresolved = [...byId.values()].filter(g =>
      !g.canalId && g.canaisTransmissao && g.canaisTransmissao.length > 0
    );
    if (unresolved.length) {
      try {
        const channels = (await loadCanais()).canais;
        for (const game of unresolved) {
          for (const name of game.canaisTransmissao || []) {
            const match = matchBrazilianBroadcastChannel(name, channels);
            if (match) {
              game.canalId = match.id;
              game.canalNome = match.nome;
              game.canalLogo = match.logo || null;
              game.transmissao = "confirmada";
              game.origemTransmissao = "grade-br";
              break;
            }
          }
        }
      } catch (error) {
        console.warn("[Sports] Catálogo de canais indisponível no placar", error);
      }
    }

    return {
      dataLocal: date,
      atualizadoEm: new Date().toISOString(),
      jogos: [...byId.values()],
      fontesConsultadas: successes,
      ligasIndisponiveis: failed,
      parcial: failed.length > 0,
    };
  })().then(value => {
    scoreCache.set(key, { value, expires: Date.now() + (date === today ? 20_000 : 90_000) });
    if (scoreCache.size > 32) scoreCache.delete(scoreCache.keys().next().value!);
    return value;
  }).finally(() => scoreInflight.delete(key));
  scoreInflight.set(key, work);
  return work;
}
