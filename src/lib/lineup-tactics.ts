import type { LineupPlayer, LineupTeam, PlayerPosition } from "./football-lineups";
import { resolveFootballPosition } from "./football-positions";

export const POSITION_SECTORS: { group: PlayerPosition; label: string }[] = [
  { group: "GOL", label: "Goleiro" },
  { group: "DEF", label: "Defesa" },
  { group: "MEI", label: "Meio-campo" },
  { group: "ATA", label: "Ataque" },
];
export function positionBadge(player: LineupPlayer) {
  // Use the match-specific provider role, not a shirt number, formation slot,
  // generic career position, or a previously cached coarse group.
  return resolveFootballPosition(player.position);
}
export interface TacticalRow { label: string; players: LineupPlayer[] }
export interface TacticalLayout { source: "grid" | "formation" | "sectors"; rows: TacticalRow[] }
function lateralOrder(players: LineupPlayer[]): LineupPlayer[] {
  return [...players].sort((a, b) => positionBadge(a).side - positionBadge(b).side);
}
export function buildTacticalLayout(team: LineupTeam): TacticalLayout {
  const coordinates = team.starting.map(player => {
    const match = player.grid?.match(/^([1-6]):([1-6])$/);
    return match ? { player, row: Number(match[1]), column: Number(match[2]) } : null;
  });
  if (coordinates.length && coordinates.every(item => item !== null) &&
      new Set(coordinates.map(item => `${item!.row}:${item!.column}`)).size === coordinates.length &&
      coordinates.some(item => item!.row > 1) &&
      coordinates.filter(item => positionBadge(item!.player).group === "GOL").every(item => item!.row === 1)) {
    const rowNumbers = [...new Set(coordinates.map(item => item!.row))].sort((a, b) => a - b);
    return { source: "grid", rows: rowNumbers.map(row => ({
      label: `Linha ${row}`,
      players: coordinates.filter(item => item!.row === row).sort((a, b) => a!.column - b!.column).map(item => item!.player),
    })) };
  }
  const shape = team.formation?.trim().match(/^([1-5])(?:\s*[-–]\s*[1-5]){1,4}$/);
  const counts = shape ? shape[0].split(/\s*[-–]\s*/).map(Number) : [];
  const keepers = team.starting.filter(player => positionBadge(player).group === "GOL");
  if (team.starting.length === 11 && keepers.length === 1 && counts.reduce((sum, count) => sum + count, 0) === 10) {
    const outfield = team.starting.filter(player => positionBadge(player).group !== "GOL")
      .sort((a, b) => positionBadge(a).depth - positionBadge(b).depth);
    let offset = 0, reliable = true;
    const rows: TacticalRow[] = [{ label: "Goleiro", players: keepers }];
    counts.forEach((count, index) => {
      const players = outfield.slice(offset, offset + count);
      const roles = players.map(positionBadge);
      // A shape cannot turn a midfielder into a defender or a central striker
      // into a winger. Conflicting or insufficient data stays organized by sector.
      if (index === 0) reliable &&= roles.every(role => role.group === "DEF");
      else if (index === counts.length - 1) reliable &&= roles.every(role => role.group === "ATA");
      else reliable &&= roles.every(role => role.group === "MEI" || role.wingback);
      offset += count;
      // Do not split indistinguishable roles into different tactical lines using
      // arbitrary provider array order (e.g. five generic midfielders in 4-2-3-1).
      if (offset < outfield.length && positionBadge(outfield[offset - 1]!).depth === positionBadge(outfield[offset]!).depth) reliable = false;
      rows.push({ label: `Linha ${index + 1}`, players: lateralOrder(players) });
    });
    if (reliable) return { source: "formation", rows };
  }
  const sectors = [...POSITION_SECTORS, { group: "ND" as const, label: "Posição não informada" }];
  return { source: "sectors", rows: sectors.flatMap(({ group, label }) => {
    const players = lateralOrder(team.starting.filter(player => positionBadge(player).group === group));
    const rows: TacticalRow[] = [];
    for (let i = 0; i < players.length; i += 5) rows.push({ label, players: players.slice(i, i + 5) });
    return rows;
  }) };
}
