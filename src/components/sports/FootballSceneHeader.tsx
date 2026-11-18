// Shared match-scene heading: a real league filter, never a decorative dropdown.
"use client";
import { useId, type ReactNode } from "react";
import { ChevronDown, Trophy, TvMinimalPlay } from "lucide-react";
import type { JogoBrasileirao } from "@/lib/jogos-match";

export type CompetitionOption = Pick<JogoBrasileirao,"ligaId"|"liga">;

export function selectedFootballLeague(
  games: readonly Pick<JogoBrasileirao,"ligaId"|"casa"|"fora"|"status">[],
  selection: string,
): string {
  const ids = new Set(games.map(game=>game.ligaId));
  if (selection !== "auto") return selection === "all" || ids.has(selection) ? selection : "all";
  // When there is a full Série A round, open with it as in the design.
  // A major non-Série A LIVE fixture or a Brazil national game stays visible.
  const brazilRound = games.filter(game=>game.ligaId === "bra.1").length >= 3;
  const importantOtherLive = games.some(game=>game.ligaId !== "bra.1" && game.status === "ao-vivo");
  const brazilSelection = games.some(game=>game.ligaId !== "bra.1" &&
    /^(?:brasil|brazil)$/i.test(game.casa+"") ||
    game.ligaId !== "bra.1" && /^(?:brasil|brazil)$/i.test(game.fora+""));
  return brazilRound && !importantOtherLive && !brazilSelection ? "bra.1" : "all";
}

export function footballCompetitions(games: readonly CompetitionOption[]): CompetitionOption[] {
  const unique = new Map<string,CompetitionOption>();
  for (const game of games) if (game.ligaId && !unique.has(game.ligaId)) {
    unique.set(game.ligaId,{ligaId:game.ligaId,liga:game.liga});
  }
  return [...unique.values()].sort((a,b)=>{
    if (a.ligaId==="bra.1") return -1;
    if (b.ligaId==="bra.1") return 1;
    if (a.ligaId==="uefa.champions") return -1;
    if (b.ligaId==="uefa.champions") return 1;
    return a.liga.localeCompare(b.liga,"pt-BR");
  });
}

export function FootballSceneHeader({
  games, selection, onChange, children, title = "Jogos de Hoje",
}: {
  games: readonly CompetitionOption[];
  selection: string;
  onChange: (leagueId:string)=>void;
  children?: ReactNode;
  title?: string;
}) {
  const id = useId();
  const leagues = footballCompetitions(games);
  const selected = leagues.find(league=>league.ligaId===selection);
  return (
    <header className="zf-scene-header">
      <div className="zf-scene-heading">
        <span className="zf-scene-title-bar" aria-hidden="true"/>
        <span className="zf-scene-tv-icon" aria-hidden="true"><TvMinimalPlay size={34} strokeWidth={1.7}/></span>
        <div className="zf-scene-title-copy">
          <h2>{title}</h2>
          <p>{selected ? "ASSISTA AO VIVO AO " + selected.liga.toLocaleUpperCase("pt-BR")
            : "ASSISTA AOS JOGOS E ACOMPANHE OS PLACARES AO VIVO"}</p>
        </div>
      </div>
      <div className="zf-scene-controls">
        <label className="zf-scene-league-picker" htmlFor={id}>
          <Trophy size={18} aria-hidden="true"/>
          <span className="zf-scene-league-copy">{selected?.liga || "Todas as competições"}</span>
          <select id={id} aria-label="Filtrar jogos por campeonato" value={selection}
            onChange={event=>onChange(event.currentTarget.value)}>
            <option value="all">Todas as competições</option>
            {leagues.map(league=><option key={league.ligaId} value={league.ligaId}>{league.liga}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true"/>
        </label>
        {children}
      </div>
    </header>
  );
}
