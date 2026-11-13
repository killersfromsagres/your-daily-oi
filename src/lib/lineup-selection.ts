// src/lib/lineup-selection.ts — avoid showing away starters as the home team.
import { normalizeSoccerName, type JogoBrasileirao } from "./jogos-match";
import { broadcastTeamKey } from "./broadcast-verified";
import type { LineupTeam, MatchLineups } from "./football-lineups";

export type TeamSide = "home" | "away";

function matches(a: string, b: string) {
  const left = broadcastTeamKey(normalizeSoccerName(a));
  const right = broadcastTeamKey(normalizeSoccerName(b));
  if (!left || !right) return false;
  return left === right || (left.length > 5 && right.startsWith(left+" ")) ||
    (right.length > 5 && left.startsWith(right+" "));
}
export function selectLineupTeam(
  game: Pick<JogoBrasileirao,"casa"|"fora">,
  data: MatchLineups | null,
  side: TeamSide,
): LineupTeam | null {
  const teams = data?.equipes || [];
  const requested = side === "home" ? game.casa : game.fora;
  const other = side === "home" ? game.fora : game.casa;
  const exact = teams.find(team => matches(team.name, requested));
  if (exact) return exact;
  // If one team is positively matched to the opposite club, the remaining
  // unique provider team can be identified without relying on array order.
  if (teams.length === 2) {
    const opposing = teams.find(team => matches(team.name, other));
    if (opposing) return teams.find(team => team !== opposing) || null;
  }
  // The provider sometimes returns only one roster or mixed team naming;
  // do not invent a team assignment and display the wrong starting XI.
  return null;
}
