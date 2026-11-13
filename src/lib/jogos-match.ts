// src/lib/jogos-match.ts — server/browser, fixture normalization and Brazilian timezone logic.
export const SPORTS_ZONE = "America/Sao_Paulo";
export interface JogoBrasileirao {
  id: string;
  casa: string;
  fora: string;
  escudoCasa: string | undefined;
  escudoFora: string | undefined;
  horarioLocal: string;
  inicioIso: string;
  dataLocal: string;
  rodada: string | undefined;
  liga: string;
  ligaId: string;
  ligaLogo: string | null;
  grupo: "brasileirao" | "champions" | "copas" | "internacional";
  status: "agendado" | "ao-vivo" | "encerrado" | "adiado";
  /** Specific match phase from provider; never estimated from kickoff time. */
  fase?: SoccerMatchPhase;
  faseRotulo?: string;
  minuto?: string | null;
  placarCasa: number | null;
  placarFora: number | null;
  destaque: boolean;
  canalId: string | null;
  canalNome: string | null;
  canalLogo: string | null;
  /** Brazilian event/EPG broadcasters, even when no matching player source exists. */
  canaisTransmissao?: string[];
  transmissao: "confirmada" | "nao-confirmada";
  origemTransmissao?: "epg" | "grade-br" | "configuracao";
}

export const LIGAS_FUTEBOL = [
  { id: "bra.1", name: "Brasileirão Série A", grupo: "brasileirao" },
  { id: "bra.2", name: "Brasileirão Série B", grupo: "brasileirao" },
  { id: "uefa.champions", name: "UEFA Champions League", grupo: "champions" },
  { id: "uefa.nations", name: "UEFA Nations League", grupo: "copas" },
  { id: "fifa.worldq.uefa", name: "Eliminatórias da Copa · Europa", grupo: "copas" },
  { id: "fifa.friendly", name: "Amistosos de seleções", grupo: "internacional" },
  { id: "conmebol.libertadores", name: "CONMEBOL Libertadores", grupo: "copas" },
  { id: "conmebol.sudamericana", name: "Copa Sul-Americana", grupo: "copas" },
  { id: "bra.copa_do_brazil", name: "Copa do Brasil", grupo: "copas" },
  { id: "eng.1", name: "Premier League", grupo: "internacional" },
  { id: "esp.1", name: "LaLiga", grupo: "internacional" },
  { id: "ita.1", name: "Serie A Italiana", grupo: "internacional" },
  { id: "ger.1", name: "Bundesliga", grupo: "internacional" },
  { id: "fra.1", name: "Ligue 1", grupo: "internacional" },
  { id: "por.1", name: "Liga Portugal", grupo: "internacional" },
  { id: "ned.1", name: "Eredivisie", grupo: "internacional" },
  { id: "arg.1", name: "Campeonato Argentino", grupo: "internacional" },
  { id: "usa.1", name: "MLS", grupo: "internacional" },
  { id: "mex.1", name: "Liga MX", grupo: "internacional" },
  { id: "sco.1", name: "Campeonato Escocês", grupo: "internacional" },
  { id: "uefa.europa", name: "UEFA Europa League", grupo: "copas" },
] as const;

export type LigaFutebol = (typeof LIGAS_FUTEBOL)[number];

const brDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SPORTS_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const brTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SPORTS_ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
});

export function dataBrasilia(now: Date = new Date()): string {
  const parts = brDateFormatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
export function horaBrasilia(now: Date): string {
  return brTimeFormatter.format(now);
}
export function addDaysUTC(date: string, count: number): string {
  const parsed = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid sports date");
  parsed.setUTCDate(parsed.getUTCDate() + count);
  return parsed.toISOString().slice(0, 10);
}
export function isValidSportsDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const parsed = new Date(input + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input;
}
export function normalizeSoccerName(name: string): string {
  return (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\b(fc|sc|ac|cf|clube|club|futebol|football|esporte)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
const FEATURED_CLUBS = [
  "flamengo","corinthians","palmeiras","sao paulo","santos","fluminense",
  "botafogo","vasco","cruzeiro","atletico mineiro","atletico mg","gremio",
  "internacional","bahia","fortaleza","vitoria","athletico paranaense",
  "real madrid","barcelona","atletico madrid","liverpool","manchester city",
  "manchester united","chelsea","arsenal","tottenham","bayern munich",
  "borussia dortmund","psg","paris saint germain","inter milan","juventus",
  "milan","napoli","benfica","porto","sporting",
];
export function isFeaturedTeam(name: string): boolean {
  const normalized = normalizeSoccerName(name);
  return FEATURED_CLUBS.some(club => normalized === normalizeSoccerName(club) ||
    normalized.startsWith(normalizeSoccerName(club) + " "));
}
export function fixturePriority(j: JogoBrasileirao): number {
  const leagueScore = j.ligaId === "bra.1" ? 80 : j.ligaId === "uefa.champions" ? 70 :
    j.ligaId === "conmebol.libertadores" ? 60 : j.ligaId === "bra.2" ? 30 : 15;
  return leagueScore + (j.destaque ? 40 : 0) + (j.status === "ao-vivo" ? 200 : 0);
}
type ESPNTeam = { homeAway?: string; score?: string | number; team?: { id?: string; displayName?: string; shortDisplayName?: string; logo?: string; logos?: { href?: string }[] } };
type ESPNCompetition = {
  date?: string;
  competitors?: ESPNTeam[];
  notes?: { headline?: string }[];
  broadcasts?: { market?: string; names?: string[] }[];
  geoBroadcasts?: { region?: string; media?: { shortName?: string } }[];
};
/** Keep timing indicators tied to the official match status (ESPN), not the wall clock. */
export type SoccerMatchPhase = "agendado" | "primeiro-tempo" | "intervalo" | "segundo-tempo" |
  "prorrogacao" | "penaltis" | "ao-vivo" | "encerrado" | "adiado";
export interface ESPNMatchStatus {
  period?: number;
  clock?: number;
  displayClock?: string;
  type?: {
    state?: string;
    name?: string;
    completed?: boolean;
    description?: string;
    detail?: string;
    shortDetail?: string;
  };
}
export function parseSoccerMatchPhase(value?: ESPNMatchStatus): {
  fase: SoccerMatchPhase; rotulo: string; minuto: string | null;
} {
  const type = value?.type;
  const description = [type?.name, type?.description, type?.detail, type?.shortDetail]
    .filter(Boolean).join(" ").toLowerCase();
  const state = type?.state;
  if (state === "post" || type?.completed || /status_final|full.?time|\bft\b|encerrado/.test(description)) {
    return { fase: "encerrado", rotulo: "Encerrado", minuto: null };
  }
  if (/postpon|cancel|suspend|adiad|aband|status_delayed/.test(description)) {
    return { fase: "adiado", rotulo: "Adiado / suspenso", minuto: null };
  }
  // ESPN may expose the same in-progress event via state or explicit status name.
  const isLiveState = state === "in" || state === "inprogress" || state === "live" ||
    /status_in_progress|in.?progress|status_live/i.test(type?.name || "");
  if (!isLiveState) return { fase: "agendado", rotulo: "Agendado", minuto: null };
  if (/half.?time|\bht\b|interval|status_halftime/.test(description)) {
    return { fase: "intervalo", rotulo: "Intervalo", minuto: null };
  }
  const clockText = value?.displayClock?.trim() || "";
  const minuteMatch = /^(\d{1,3})(?:['’′]?\+(\d{1,2}))?/.exec(clockText);
  const minute = minuteMatch
    ? minuteMatch[1] + (minuteMatch[2] ? "+" + minuteMatch[2] : "") + "′"
    : null;
  if (/penalt|shoot.?out|\bpso\b|status_penalty/.test(description)) {
    return { fase: "penaltis", rotulo: "Pênaltis", minuto: null };
  }
  if (/extra.?time|prorrog|\bet\b/.test(description) || (value?.period ?? 0) >= 3) {
    return { fase: "prorrogacao", rotulo: "Prorrogação", minuto: minute };
  }
  if (/second.?half|2nd.?half|segundo.?tempo|\b2t\b/.test(description) || value?.period === 2) {
    return { fase: "segundo-tempo", rotulo: "2º tempo", minuto: minute };
  }
  if (/first.?half|1st.?half|primeiro.?tempo|\b1t\b/.test(description) || value?.period === 1) {
    return { fase: "primeiro-tempo", rotulo: "1º tempo", minuto: minute };
  }
  return { fase: "ao-vivo", rotulo: "Ao vivo", minuto: minute };
}
export type ESPNEvent = {
  id?: string;
  date?: string;
  status?: ESPNMatchStatus;
  competitions?: ESPNCompetition[];
  season?: { type?: { name?: string } };
};
function safeLogo(logo: unknown): string | undefined {
  if (typeof logo !== "string") return undefined;
  try {
    const u = new URL(logo);
    return u.protocol === "https:" ? u.href : undefined;
  } catch { return undefined; }
}
export function brBroadcastsFromESPN(event: ESPNEvent): string[] {
  const competition = event.competitions?.[0];
  const fromGeo = (competition?.geoBroadcasts || [])
    .filter(x => /^(br|bra|brazil|brasil)$/i.test(x.region || ""))
    .map(x => x.media?.shortName || "").filter(Boolean);
  const fromMarket = (competition?.broadcasts || [])
    .filter(x => /^(br|brazil|brasil)$/i.test(x.market || ""))
    .flatMap(x => x.names || []);
  return [...new Set([...fromGeo, ...fromMarket].map(x => x.trim()).filter(Boolean))];
}
export function parseESPNFixture(event: ESPNEvent, liga: LigaFutebol, data: string): JogoBrasileirao | null {
  const competition = event.competitions?.[0];
  const startText = competition?.date || event.date;
  if (!startText || !event.id) return null;
  const start = new Date(startText);
  if (!Number.isFinite(start.getTime()) || dataBrasilia(start) !== data) return null;
  const home = competition?.competitors?.find(x=>x.homeAway==="home");
  const away = competition?.competitors?.find(x=>x.homeAway==="away");
  if (!home?.team?.displayName || !away?.team?.displayName) return null;
  const phase = parseSoccerMatchPhase(event.status);
  const status = phase.fase === "encerrado" ? "encerrado" :
    phase.fase === "adiado" ? "adiado" :
    phase.fase === "agendado" ? "agendado" : "ao-vivo";
  const parseScore = (value: string | number | undefined): number | null => {
    if (status === "agendado" || status === "adiado") return null;
    const x=Number(value);
    return value === undefined || value === null || !Number.isFinite(x) ? null : x;
  };
  const homeName = home.team.displayName, awayName = away.team.displayName;
  return {
    id: liga.id + ":" + event.id,
    casa: homeName, fora: awayName,
    escudoCasa: safeLogo(home.team.logo || home.team.logos?.[0]?.href),
    escudoFora: safeLogo(away.team.logo || away.team.logos?.[0]?.href),
    horarioLocal: horaBrasilia(start),
    inicioIso: start.toISOString(),
    dataLocal: data, rodada: competition?.notes?.[0]?.headline || undefined,
    liga: liga.name, ligaId: liga.id, ligaLogo: null, grupo: liga.grupo,
    status, fase: phase.fase, faseRotulo: phase.rotulo, minuto: phase.minuto,
    placarCasa: parseScore(home.score), placarFora: parseScore(away.score),
    destaque: liga.id === "bra.1" || liga.id === "uefa.champions" || isFeaturedTeam(homeName) || isFeaturedTeam(awayName),
    canalId: null, canalNome: null, canalLogo: null, transmissao: "nao-confirmada",
  };
}
// Alternate spellings common in Brazilian XMLTV guides and ESPN fixture names.
// These are identity aliases, never an inference about who owns broadcast rights.
const TEAM_ALIASES: Record<string, string[]> = {
  "atletico mineiro": ["atletico mg", "atl mineiro", "galo"],
  "manchester city": ["man city"], "manchester united": ["man utd", "man united"],
  "tottenham hotspur": ["tottenham", "spurs"],
  "nottingham forest": ["nottm forest", "nott forest"],
  "wolverhampton wanderers": ["wolves", "wolverhampton"],
  "newcastle united": ["newcastle"], "west ham united": ["west ham"],
  "brighton and hove albion": ["brighton"],
  "paris saint germain": ["psg", "paris sg"],
  "bayern munich": ["bayern munique", "bayern munchen", "fc bayern"],
  "borussia dortmund": ["dortmund", "bvb"],
  "inter milan": ["internazionale", "inter de milao"],
  "atletico madrid": ["atl madrid", "atleti"],
  "real betis": ["betis"], "athletic club": ["athletic bilbao"],
  "sporting cp": ["sporting lisboa", "sporting lisbon"],
  "racing club": ["racing de avellaneda"], "river plate": ["river"], "boca juniors": ["boca"],
  "atletico goianiense": ["atletico go", "atletico goias"],
  "atletico mg": ["atletico mineiro", "atl mineiro", "galo"],
  "athletico paranaense": ["athletico pr", "atletico pr"],
  "athletico pr": ["athletico paranaense", "atletico pr"],
  "atletico paranaense": ["athletico paranaense", "athletico pr"],
  "gremio": ["gremio rs"],
  "internacional": ["internacional rs", "inter rs"],
  "sao paulo": ["sao paulo fc"],
  "vasco da gama": ["vasco"],
  "vasco": ["vasco da gama"],
  "red bull bragantino": ["bragantino", "rb bragantino"],
  "bragantino": ["red bull bragantino", "rb bragantino"],
};
function clubMentions(text: string, club: string): boolean {
  const key = normalizeSoccerName(club);
  if (key.length < 3) return false;
  const variants = [key, ...(TEAM_ALIASES[key] || [])];
  return variants.some(name => text.includes(" " + name + " "));
}
export function doesEpgDescribeFixture(description: string, casa: string, fora: string): boolean {
  const title = " " + normalizeSoccerName(description) + " ";
  const home = normalizeSoccerName(casa), away = normalizeSoccerName(fora);
  if (home === away) return false;
  return clubMentions(title, casa) && clubMentions(title, fora);
}
