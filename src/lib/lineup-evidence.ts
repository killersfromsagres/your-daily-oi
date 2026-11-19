import type { LineupTeam, MatchLineups } from "./football-lineups";
import type { TacticalLayout } from "./lineup-tactics";

export interface LineupEvidence {
  status:"complete"|"partial"|"unavailable";
  label:string;
  detail:string;
  tacticalLabel:string;
  source:string;
  updatedLabel:string;
  publishedPlayers:number;
}
/** Completeness != official confirmation, and a team formation != accurate XY. */
export function lineupEvidence(
  data:MatchLineups|null, team:LineupTeam|null,
  layout:Pick<TacticalLayout,"source">|null,
):LineupEvidence {
  const publishedPlayers=team?.starting.length||0;
  const status=publishedPlayers===11?"complete":publishedPlayers>0?"partial":"unavailable";
  const tacticalLabel=layout?.source==="grid"?"Posições individuais da fonte":
    layout?.source==="formation"?"Formação compatível com as funções":
    "Posições agrupadas por setor";
  let updatedLabel="Atualização não informada";
  const date=data?.atualizadoEm?new Date(data.atualizadoEm):null;
  if(date && Number.isFinite(date.getTime())){
    updatedLabel="Consultado "+new Intl.DateTimeFormat("pt-BR",{
      timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",
    }).format(date);
  }
  return {
    status,publishedPlayers,
    label:status==="complete"?"11 titulares publicados":
      status==="partial"?"Escalação parcial":"Escalação não divulgada",
    detail:status==="complete"
      ?"Onze titulares identificados na resposta do provedor. Isto não equivale a uma confirmação oficial do clube."
      :status==="partial"
        ?"Exibindo apenas os jogadores explicitamente identificados pelo provedor."
        :"O provedor ainda não publicou titulares suficientes para esta equipe.",
    tacticalLabel,source:data?.origem||"Fonte indisponível",updatedLabel,
  };
}
