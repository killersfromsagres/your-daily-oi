import {describe,expect,test} from "bun:test";
import {webBroadcastState,WEB_BROADCAST_MAX_AGE} from "../src/lib/web-broadcast-state";
import type {JogoBrasileirao} from "../src/lib/jogos-match";
const now=Date.parse("2026-11-24T20:00:00Z");
const fixture={status:"ao-vivo",canalId:"sportv2",canalNome:"SporTV 2",transmissao:"confirmada",transmissaoVerificadaEm:new Date(now).toISOString()} as JogoBrasileirao;
describe("Web card broadcast safety",()=>{
 test("validates the fresh exact channel",()=>expect(webBroadcastState(fixture,now).internal).toBe(true));
 test("expired or unverified links do not play",()=>{expect(webBroadcastState(fixture,now+WEB_BROADCAST_MAX_AGE).internal).toBe(false);expect(webBroadcastState({...fixture,transmissao:"nao-confirmada"},now).internal).toBe(false);expect(webBroadcastState({...fixture,transmissaoVerificadaEm:undefined},now).internal).toBe(false);});
 test("finished and postponed cards cannot launch unrelated programmes",()=>{for(const status of ["encerrado","adiado"] as const)expect(webBroadcastState({...fixture,status},now).internal).toBe(false);});
 test("official destination requires current evidence and approved domain",()=>{const game={...fixture,canalId:null,transmissaoUrl:"https://www.primevideo.com/detail/ABC123"};expect(webBroadcastState(game,now).official?.provider).toBe("Prime Video");expect(webBroadcastState(game,now+WEB_BROADCAST_MAX_AGE).official).toBeNull();expect(webBroadcastState({...game,transmissaoUrl:"https://example.com"},now).official).toBeNull();});
});
