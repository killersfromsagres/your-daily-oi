// Date-scoped match results independently confirmed by official reports.
// These are exceptional fallbacks only when the score provider lags behind.
// Official source: https://www.cbf.com.br/selecao-brasileira/noticias/selecao-masculina/a/brasil-e-superado-pelo-japao-em-singapura
import { broadcastTeamKey } from "./broadcast-verified";
import type { JogoBrasileirao } from "./jogos-match";

export interface VerifiedResultEvidence {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  publishedAt: string;
  source: string;
}

const verifiedResults: readonly VerifiedResultEvidence[] = [
  {
    date: "2026-11-14",
    home: "japao",
    away: "brasil",
    homeScore: 3,
    awayScore: 2,
    publishedAt: "2026-11-14T12:42:00Z",
    source: "https://www.cbf.com.br/selecao-brasileira/noticias/selecao-masculina/a/brasil-e-superado-pelo-japao-em-singapura",
  },
];

/** Never transfer another game/date's result or publish a result prematurely. */
export function verifiedMatchResult(
  match: Pick<JogoBrasileirao, "casa" | "fora" | "dataLocal">,
  nowMs = Date.now(),
): { homeScore: number; awayScore: number; evidence: VerifiedResultEvidence } | null {
  const home = broadcastTeamKey(match.casa);
  const away = broadcastTeamKey(match.fora);
  for (const evidence of verifiedResults) {
    if (evidence.date !== match.dataLocal || nowMs < Date.parse(evidence.publishedAt)) continue;
    if (home === evidence.home && away === evidence.away) {
      return { homeScore: evidence.homeScore, awayScore: evidence.awayScore, evidence };
    }
    if (home === evidence.away && away === evidence.home) {
      return { homeScore: evidence.awayScore, awayScore: evidence.homeScore, evidence };
    }
  }
  return null;
}

/** The real score feed wins when it already has a completed, scored fixture. */
export function applyVerifiedResult(match: JogoBrasileirao, nowMs = Date.now()): JogoBrasileirao {
  if (match.status === "encerrado" && match.placarCasa !== null && match.placarFora !== null) return match;
  const proof = verifiedMatchResult(match, nowMs);
  if (!proof) return match;
  return {
    ...match,
    status: "encerrado",
    fase: "encerrado",
    faseRotulo: "Encerrado",
    minuto: null,
    placarCasa: proof.homeScore,
    placarFora: proof.awayScore,
  };
}
