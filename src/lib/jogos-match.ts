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
  grupo: "brasileirao" | "champions" | "copas" | "internacional";
  status: "agendado" | "ao-vivo" | "encerrado" | "adiado";
  placarCasa: number | null;
  placarFora: number | null;
  destaque: boolean;
  canalId: string | null;
  canalNome: string | null;
  canalLogo: string | null;
  transmissao: "confirmada" | "nao-confirmada";
  origemTransmissao?: "epg" | "grade-br" | "configuracao";
}

export const LIGAS_FUTEBOL = [
  { id: "bra.1", name: "Brasileirão Série A", grupo: "brasileirao" },
  { id: "bra.2", name: "Brasileirão Série B", grupo: "brasileirao" },
  { id: "uefa.champions", name: "UEFA Champions League", grupo: "champions" },
  { id: "conmebol.libertadores", name: "CONMEBOL Libertadores", grupo: "copas" },
  { id: "conmebol.sudamericana", name: "Copa Sul-Americana", grupo: "copas" },
  { id: "bra.copa_do_brasil", name: "Copa do Brasil", grupo: "copas" },
  { id: "eng.1", name: "Premier League", grupo: "internacional" },
  { id: "esp.1", name: "LaLiga", grupo: "internacional" },
  { id: "ita.1", name: "Serie A Italiana", grupo: "internacional" },
  { id: "ger.1", name: "Bundesliga", grupo: "internacional" },
  { id: "fra.1", name: "Ligue 1", grupo: "internacional" },
  { id: "por.1", name: "Liga Portugal", grupo: "internacional" },
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
    .replace(/[^a-z0-9]+/g, " ").replace(/\b(fc|sc|ac|cf|clube|club|futebol|football|esporte|sporting)\b/g, " ")
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
export type ESPNEvent = {
  id?: string;
  date?: string;
  status?: { type?: { state?: string; name?: string; completed?: boolean } };
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
  const statusType = event.status?.type;
  const state = statusType?.state;
  const status = state === "in" ? "ao-vivo" :
    state === "post" || statusType?.completed ? "encerrado" :
    /postpon|cancel|suspend/i.test(statusType?.name || "") ? "adiado" : "agendado";
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
    liga: liga.name, ligaId: liga.id, grupo: liga.grupo,
    status, placarCasa: parseScore(home.score), placarFora: parseScore(away.score),
    destaque: liga.id === "bra.1" || liga.id === "uefa.champions" || isFeaturedTeam(homeName) || isFeaturedTeam(awayName),
    canalId: null, canalNome: null, canalLogo: null, transmissao: "nao-confirmada",
  };
}
export function doesEpgDescribeFixture(description: string, casa: string, fora: string): boolean {
  const title = " " + normalizeSoccerName(description) + " ";
  const a = normalizeSoccerName(casa), b = normalizeSoccerName(fora);
  if (a.length < 4 || b.length < 4 || a === b) return false;
  return title.includes(" " + a + " ") && title.includes(" " + b + " ");
}
