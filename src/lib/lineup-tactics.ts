// Presentation only: never infer player ability or condition from a position.
import type { LineupPlayer, LineupTeam, PlayerPosition } from "./football-lineups";

export const POSITION_SECTORS: { group: PlayerPosition; label: string }[] = [
  { group: "GOL", label: "Goleiro" },
  { group: "DEF", label: "Defesa" },
  { group: "MEI", label: "Meio-campo" },
  { group: "ATA", label: "Ataque" },
];

export function positionBadge(player: LineupPlayer): { code: string; label: string } {
  const p = player.position.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const right = /right|direit|\b(?:rb|rwb|rm|rw|rd|ld|pd|md)\b/.test(p);
  const left = /left|esquerd|\b(?:lb|lwb|lm|lw|le|pe|me)\b/.test(p);
  if (player.group === "GOL") return { code: "GOL", label: "Goleiro" };
  if (player.group === "DEF") {
    if (right) return { code: "LD", label: "Lateral direito" };
    if (left) return { code: "LE", label: "Lateral esquerdo" };
    return { code: "ZAG", label: "Defensor" };
  }
  if (player.group === "ATA") {
    if (right) return { code: "PD", label: "Ponta direita" };
    if (left) return { code: "PE", label: "Ponta esquerda" };
    if (/second|segundo|\bss\b/.test(p)) return { code: "SA", label: "Segundo atacante" };
    return { code: "ATA", label: "Atacante" };
  }
  if (/defens|volante|\b(?:dm|cdm)\b/.test(p)) return { code: "VOL", label: "Volante" };
  if (/attacking|ofens|\b(?:am|cam)\b/.test(p)) return { code: "MAT", label: "Meia ofensivo" };
  if (right) return { code: "MD", label: "Meia direito" };
  if (left) return { code: "ME", label: "Meia esquerdo" };
  if (/cent(er|re|ral)|\bcm\b/.test(p)) return { code: "MC", label: "Meia central" };
  return { code: "MEI", label: "Meio-campista" };
}

export interface TacticalRow { label: string; players: LineupPlayer[] }
export interface TacticalLayout { source: "grid" | "formation" | "sectors"; rows: TacticalRow[] }

const sectorRank = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };
function midfieldRank(player: LineupPlayer) {
  const role = positionBadge(player).code;
  return role === "VOL" ? 0 : role === "MAT" ? 2 : 1;
}
export function buildTacticalLayout(team: LineupTeam): TacticalLayout {
  // Row:column coordinates are explicit provider data. Scalar ESPN formationPlace
  // values are not coordinates and must not be mistaken for tactical rows.
  const coordinates = team.starting.map(player => {
    const match = player.grid?.match(/^([1-6]):([1-6])$/);
    return match ? { player, row: Number(match[1]), column: Number(match[2]) } : null;
  });
  if (coordinates.length && coordinates.every(item => item !== null) &&
      new Set(coordinates.map(item => `${item!.row}:${item!.column}`)).size === coordinates.length &&
      coordinates.some(item => item!.row > 1) &&
      coordinates.filter(item => item!.player.group === "GOL").every(item => item!.row === 1)) {
    const rowNumbers = [...new Set(coordinates.map(item => item!.row))].sort((a, b) => a - b);
    return { source: "grid", rows: rowNumbers.map(row => ({
      label: `Linha ${row}`,
      players: coordinates.filter(item => item!.row === row).sort((a, b) => a!.column - b!.column).map(item => item!.player),
    })) };
  }
  const shape = team.formation?.trim().match(/^([1-5])(?:\s*[-–]\s*[1-5]){1,4}$/);
  const counts = shape ? shape[0].split(/\s*[-–]\s*/).map(Number) : [];
  const keepers = team.starting.filter(player => player.group === "GOL");
  if (team.starting.length === 11 && keepers.length === 1 && counts.reduce((sum, count) => sum + count, 0) === 10) {
    const outfield = team.starting.filter(player => player.group !== "GOL").sort((a, b) =>
      sectorRank[a.group] - sectorRank[b.group] || midfieldRank(a) - midfieldRank(b));
    let offset = 0;
    return { source: "formation", rows: [{ label: "Goleiro", players: keepers }, ...counts.map((count, index) => {
      const players = outfield.slice(offset, offset + count);
      offset += count;
      return { label: `Linha ${index + 1}`, players };
    })] };
  }
  // Partial/unannounced shapes stay faithful to the published sectors. Cap the
  // density so even a five-man midfield remains readable on a narrow phone.
  return { source: "sectors", rows: POSITION_SECTORS.flatMap(({ group, label }) => {
    const players = team.starting.filter(player => player.group === group);
    const rows: TacticalRow[] = [];
    for (let i = 0; i < players.length; i += 5) rows.push({ label, players: players.slice(i, i + 5) });
    return rows;
  }) };
}
