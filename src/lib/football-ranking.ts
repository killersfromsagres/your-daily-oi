// src/lib/football-ranking.ts — editorial ordering for Zang Flix football fixtures.
import { isFeaturedTeam, type JogoBrasileirao } from "./jogos-match";

const LEAGUE_WEIGHT: Record<string, number> = {
  "bra.1": 1000,
  "uefa.champions": 950,
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
export function matchImportance(match: JogoBrasileirao): number {
  const home = isFeaturedTeam(match.casa);
  const away = isFeaturedTeam(match.fora);
  return (LEAGUE_WEIGHT[match.ligaId] ?? 60) +
    (home ? 120 : 0) + (away ? 120 : 0) +
    (home && away ? 75 : 0) +
    (match.status === "ao-vivo" ? 220 : 0) +
    (match.canalId ? 25 : 0);
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
    byId.set(update.id, {
      ...previous,
      status: update.status,
      fase: update.fase,
      faseRotulo: update.faseRotulo,
      minuto: update.minuto,
      placarCasa: update.placarCasa ?? previous.placarCasa,
      placarFora: update.placarFora ?? previous.placarFora,
      canalId: previous.canalId || update.canalId,
      canalNome: previous.canalNome || update.canalNome,
      canalLogo: previous.canalLogo || update.canalLogo,
      canaisTransmissao: previous.canaisTransmissao?.length ? previous.canaisTransmissao : update.canaisTransmissao,
      transmissao: previous.canalId || update.canalId ? "confirmada" : previous.transmissao,
      origemTransmissao: previous.origemTransmissao || update.origemTransmissao,
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
    g.ligaId === "bra.1" || g.ligaId === "uefa.champions" ||
    isFeaturedTeam(g.casa) || isFeaturedTeam(g.fora)
  );
  return sortedFootballMatches(featured).slice(0, Math.max(0,Math.min(30,Math.floor(limit))));
}
