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
