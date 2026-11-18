/**
 * Presentation only. The match feed is authoritative for live status, score,
 * period and minute. The device clock controls ONLY the five-minute pregame
 * highlight; it must never synthesize goals or declare a game live.
 */
import type { JogoBrasileirao } from "./jogos-match";

export interface MatchCardVisual {
  phase: "scheduled" | "soon" | "live" | "finished" | "postponed";
  statusLabel: string;
  periodLabel: string | null;
  remainingLabel: string | null;
  highlightWatch: boolean;
  showScore: boolean;
  scoreHome: string;
  scoreAway: string;
}

export function getMatchCardVisual(
  game: Pick<JogoBrasileirao,
    "status" | "fase" | "faseRotulo" | "minuto" | "inicioIso" | "placarCasa" | "placarFora">,
  nowMs: number,
): MatchCardVisual {
  const scored = game.placarCasa !== null && game.placarFora !== null &&
    Number.isFinite(game.placarCasa) && Number.isFinite(game.placarFora);
  const showScore = scored && (game.status === "ao-vivo" || game.status === "encerrado");
  const startMs = Date.parse(game.inicioIso);
  const delta = Number.isFinite(startMs) && nowMs > 0 ? startMs - nowMs : Number.POSITIVE_INFINITY;
  const soon = game.status === "agendado" && delta >= 0 && delta <= 5 * 60_000;
  const remainingMinutes = soon ? Math.ceil(delta / 60_000) : 0;
  const phase: MatchCardVisual["phase"] =
    game.status === "ao-vivo" ? "live" :
    game.status === "encerrado" ? "finished" :
    game.status === "adiado" ? "postponed" :
    soon ? "soon" : "scheduled";
  const statusLabel =
    phase === "live" ? game.fase === "intervalo" ? "INTERVALO" : "AO VIVO" :
    phase === "finished" ? "ENCERRADO" :
    phase === "postponed" ? "ADIADO" :
    phase === "soon" ? "EM BREVE" : "AGENDADO";
  const periodLabel = phase === "live"
    ? (game.faseRotulo?.trim() && game.faseRotulo.toLowerCase() !== "ao vivo"
      ? game.faseRotulo : null)
    : null;
  return {
    phase,
    statusLabel,
    periodLabel,
    remainingLabel: soon ? remainingMinutes > 0 ? "FALTA " + remainingMinutes + " MIN" : "COMEÇA EM INSTANTES" : null,
    highlightWatch: soon,
    showScore,
    scoreHome: showScore ? String(game.placarCasa) : "—",
    scoreAway: showScore ? String(game.placarFora) : "—",
  };
}
