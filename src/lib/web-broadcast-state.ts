import type {JogoBrasileirao} from "./jogos-match";
import {officialBroadcastTarget} from "./official-broadcast";
export const WEB_BROADCAST_MAX_AGE=10*60_000;
/** Preserve announced names, but never expose a revoked or expired direct action. */
export function webBroadcastState(game:JogoBrasileirao,now:number){
 const time=Date.parse(game.transmissaoVerificadaEm||"");
 const fresh=Number.isFinite(time)&&(now===0||(time<=now+60_000&&now-time<WEB_BROADCAST_MAX_AGE));
 const playable=game.status==="agendado"||game.status==="ao-vivo";
 const internal=fresh&&playable&&game.transmissao==="confirmada"&&!!game.canalId&&!!game.canalNome;
 const official=fresh&&playable?officialBroadcastTarget(game.transmissaoUrl):null;
 return {internal,official,fresh,playable};
}
