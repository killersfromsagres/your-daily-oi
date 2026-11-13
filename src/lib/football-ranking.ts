// src/lib/football-ranking.ts — editorial ordering for Zang Flix football fixtures.
import { isFeaturedTeam, type JogoBrasileirao } from "./jogos-match";

const LEAGUE_WEIGHT: Record<string, number> = {
  "bra.1": 1000,
  "uefa.champions": 950,
  "uefa.nations": 680,
  "fifa.worldq.uefa": 665,
  "fifa.friendly": 280,
  "conmebol.libertadores": 790,
  "bra.copa_do_brazil": 650,
  "eng.1": 550,
  "esp.1": 530,
  "ita.1": 490,
  "ger.1": 470,
  "fra.1": 420,
  "uefa.europa": 400,
  "por.1": 360,
  "arg.1": 355,
  "ned.1": 345,
  "usa.1": 310,
  "mex.1": 280,
  "sco.1": 220,
  "conmebol.sudamericana": 320,
  "bra.2": 100,
};
// Editorial relevance is based on real fixtures. Never synthesize a Brazil game.
const NATIONAL_TEAM_WEIGHTS: Record<string,number> = {
  brasil:5000,brazil:5000,argentina:2800,franca:2550,france:2550,
  inglaterra:2500,england:2500,espanha:2450,spain:2450,
  portugal:2420,alemanha:2400,germany:2400,italia:2320,italy:2320,
  holanda:2250,netherlands:2250,uruguai:2180,uruguay:2180,
  japao:2050,japan:2050,belgica:2020,belgium:2020,
  croacia:1900,croatia:1900,coreia:1850,"south korea":1850,
  "republic of korea":1850,marrocos:1820,morocco:1820,
};
function nationalTeamWeight(name:string):number {
  const normal=name.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  return NATIONAL_TEAM_WEIGHTS[normal]||0;
}
function isNationalCompetition(name:string):boolean {
  return /amistos|friendly|nations league|world cup|copa do mundo|eliminat|qualif|copa america|euro /i.test(name);
}
export function isBrazilFixture(game:Pick<JogoBrasileirao,"casa"|"fora">):boolean {
  return nationalTeamWeight(game.casa)===5000 || nationalTeamWeight(game.fora)===5000;
}
export function matchImportance(match: JogoBrasileirao): number {
  const home = isFeaturedTeam(match.casa);
  const away = isFeaturedTeam(match.fora);
  const international = isNationalCompetition(match.liga);
  const priority = international ? Math.max(nationalTeamWeight(match.casa),nationalTeamWeight(match.fora)) : 0;
  const second = international ? Math.min(nationalTeamWeight(match.casa),nationalTeamWeight(match.fora)) : 0;
  return (LEAGUE_WEIGHT[match.ligaId] ?? 60) +
    priority + second * .1 +
    (home ? 120 : 0) + (away ? 120 : 0) +
    (home && away ? 75 : 0) +
    (match.status === "ao-vivo" ? 2500 : 0) +
    (match.status === "encerrado" ? -1700 : 0) +
    (match.canalId ? 40 : 0);
}
/** Live score feed updates match state without discarding verified TV links from the agenda. */
export function mergeFootballScores(
  agenda: readonly JogoBrasileirao[],
  placares: readonly JogoBrasileirao[],
  date: string,
): JogoBrasileirao[] {
  const byId = new Map(agenda.filter(g => g.dataLocal === date).map(g => [g.id, g]));
  for (const update of placares) {
    if (update.dataLocal !== date) continue;
    const previous = byId.get(update.id);
    if (!previous) {
      byId.set(update.id, update);
      continue;
    }
    // Do not regress an in-progress match to "scheduled" on an inconsistent feed.
    if (previous.status === "ao-vivo" && update.status === "agendado") continue;
    const origin = previous.origemTransmissao ?? update.origemTransmissao;
    const broadcasters = previous.canaisTransmissao?.length ?
      previous.canaisTransmissao : update.canaisTransmissao;
    byId.set(update.id, {
      ...previous,
      status: update.status,
      ...(update.fase ? {fase: update.fase} : {}),
      ...(update.faseRotulo ? {faseRotulo: update.faseRotulo} : {}),
      ...(update.minuto !== undefined ? {minuto: update.minuto} : {}),
      placarCasa: update.placarCasa ?? previous.placarCasa,
      placarFora: update.placarFora ?? previous.placarFora,
      canalId: previous.canalId || update.canalId,
      canalNome: previous.canalNome || update.canalNome,
      canalLogo: previous.canalLogo || update.canalLogo,
      ...(previous.canaisDisponiveis?.length || update.canaisDisponiveis?.length ?
        { canaisDisponiveis: previous.canaisDisponiveis?.length ? previous.canaisDisponiveis : update.canaisDisponiveis } : {}),
      ...(broadcasters?.length ? {canaisTransmissao: broadcasters} : {}),
      transmissao: previous.canalId || update.canalId ? "confirmada" : previous.transmissao,
      ...(origin ? {origemTransmissao: origin} : {}),
    });
  }
  return [...byId.values()];
}

/** Poll active and nearby matches more frequently; the full agenda discovers new fixtures. */
export function liveScoreLeagueIds(games: readonly JogoBrasileirao[], nowMs: number): string[] {
  const ids = new Set<string>();
  for (const game of games) {
    const kickoff = Date.parse(game.inicioIso);
    const nearby = Number.isFinite(kickoff) &&
      kickoff >= nowMs - 4 * 60 * 60_000 && kickoff <= nowMs + 2 * 60 * 60_000;
    if (game.status === "ao-vivo" || (nearby && game.status === "agendado")) ids.add(game.ligaId);
  }
  return [...ids].sort();
}

export function sortedFootballMatches(games: readonly JogoBrasileirao[]): JogoBrasileirao[] {
  return [...games].sort((a,b) =>
    matchImportance(b) - matchImportance(a) ||
    Date.parse(a.inicioIso) - Date.parse(b.inicioIso) ||
    a.id.localeCompare(b.id)
  );
}
/**
 * Small TV shelf: Serie A + Champions first, other competitions only when a
 * recognised heavyweight is playing. Full /futebol always retains ALL games.
 */
export function featuredFootballMatches(games: readonly JogoBrasileirao[], limit=8): JogoBrasileirao[] {
  const featured = games.filter(g =>
    isBrazilFixture(g) || (isNationalCompetition(g.liga) &&
      (nationalTeamWeight(g.casa)>0 || nationalTeamWeight(g.fora)>0)) ||
    g.ligaId === "bra.1" || g.ligaId === "uefa.champions" ||
    g.ligaId === "uefa.nations" || g.ligaId === "fifa.worldq.uefa" ||
    isFeaturedTeam(g.casa) || isFeaturedTeam(g.fora)
  );
  // International breaks do not justify an empty shelf when fixtures exist.
  const pool=featured.length?featured:games;
  return sortedFootballMatches(pool).slice(0, Math.max(0,Math.min(30,Math.floor(limit))));
}
