// src/lib/broadcast-verified.ts — verified match rights, date-scoped and never guessed.
// Sources (published 2026-11-12, checked 2026-11-13):
// https://www.cnnbrasil.com.br/esportes/futebol/selecao-brasileira/brasil-x-japao-horario-e-onde-assistir-ao-amistoso-da-selecao/
// https://redeglobo.globo.com/rpc/noticia/brasil-x-japao-selecao-brasileira-entra-em-campo-neste-sabado-14.ghtml
import type { JogoBrasileirao } from "./jogos-match";

export interface BroadcastEvidence {
  names: readonly string[];
  source: string;
  checkedAt: string;
}
const REGION_ALIASES:Record<string,string> = {
  "atletico mineiro":"atletico mg","athletico paranaense":"athletico pr",
  "man united":"manchester united","psg":"paris saint germain",
  "bayern munich":"bayern munchen","inter milan":"internazionale",
  brazil:"brasil",japan:"japao",japanese:"japao",
  england:"inglaterra",france:"franca",germany:"alemanha",
  italy:"italia",spain:"espanha",netherlands:"holanda",
  "south korea":"coreia do sul","republic of korea":"coreia do sul",
};
export function broadcastTeamKey(name:string):string {
  const normalized=(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  return REGION_ALIASES[normalized]||normalized;
}
const verified:readonly {
  date:string;teams:readonly [string,string];data:BroadcastEvidence;
}[]=[
  {
    date:"2026-11-14",teams:["brasil","japao"],
    data:{
      names:["TV Globo","SporTV","ge TV"],
      source:"https://www.cnnbrasil.com.br/esportes/futebol/selecao-brasileira/brasil-x-japao-horario-e-onde-assistir-ao-amistoso-da-selecao/",
      checkedAt:"2026-11-13",
    },
  },
];
export function verifiedBroadcastEvidence(
  game:Pick<JogoBrasileirao,"casa"|"fora"|"dataLocal">,
):BroadcastEvidence|null {
  const a=broadcastTeamKey(game.casa),b=broadcastTeamKey(game.fora);
  const entry=verified.find(item=>item.date===game.dataLocal&&
    ((a===item.teams[0]&&b===item.teams[1])||
     (b===item.teams[0]&&a===item.teams[1])));
  return entry?.data||null;
}
export function sameBroadcastFixture(
  a:Pick<JogoBrasileirao,"casa"|"fora"|"inicioIso">,
  b:Pick<JogoBrasileirao,"casa"|"fora"|"inicioIso">,
):boolean {
  const kickoffA=Date.parse(a.inicioIso),kickoffB=Date.parse(b.inicioIso);
  if(!Number.isFinite(kickoffA)||!Number.isFinite(kickoffB)||
    Math.abs(kickoffA-kickoffB)>110*60_000)return false;
  const ah=broadcastTeamKey(a.casa),aa=broadcastTeamKey(a.fora);
  const bh=broadcastTeamKey(b.casa),ba=broadcastTeamKey(b.fora);
  return (ah===bh&&aa===ba)||(ah===ba&&aa===bh);
}
