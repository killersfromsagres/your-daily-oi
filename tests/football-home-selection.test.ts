import {describe,expect,test} from "bun:test";
import {homeFootballMatches} from "../src/lib/football-home-selection";
import type {JogoBrasileirao} from "../src/lib/jogos-match";
import {readFileSync} from "node:fs";
const day="2026-11-24",now=Date.parse(day+"T19:00:00Z");
const game=(id:string,ligaId="bra.1"):JogoBrasileirao=>({id,ligaId,liga:ligaId,casa:"Flamengo",fora:"Palmeiras",escudoCasa:undefined,escudoFora:undefined,horarioLocal:"17:00",inicioIso:day+"T20:00:00Z",dataLocal:day,rodada:undefined,ligaLogo:null,grupo:"brasileirao",status:"agendado",placarCasa:null,placarFora:null,destaque:true,canalId:"canal-"+id,canalNome:"Canal "+id,canalLogo:null,transmissao:"confirmada",transmissaoVerificadaEm:new Date(now).toISOString()});
describe("Home sports editorial shelf",()=>{
 test("live first, relevant leagues ahead of lesser leagues",()=>{const live={...game("live","bra.2"),status:"ao-vivo" as const};expect(homeFootballMatches([game("small","bra.2"),game("big"),live],day,now).map(g=>g.id)).toEqual(["live","big","small"]);});
 test("never highlights finished, postponed, another day or unverified/expired targets",()=>{const a=game("valid");expect(homeFootballMatches([a,{...game("finished"),status:"encerrado"},{...game("postponed"),status:"adiado"},{...game("tomorrow"),dataLocal:"2026-11-25"},{...game("unconfirmed"),transmissao:"nao-confirmada"},{...game("expired"),transmissaoVerificadaEm:new Date(now-600001).toISOString()}],day,now)).toEqual([a]);});
 test("deduplicates and caps at six",()=>{const rows=Array.from({length:10},(_,i)=>game(String(i)));expect(homeFootballMatches([...rows,rows[0]!],day,now,20)).toHaveLength(6);});
 test("official subscription destination is web only",()=>{const g={...game("official"),canalId:null,canalNome:null,transmissao:"nao-confirmada" as const,transmissaoUrl:"https://www.primevideo.com/detail/ABC123"};expect(homeFootballMatches([g],day,now,6,true)).toHaveLength(1);expect(homeFootballMatches([g],day,now,6,false)).toHaveLength(0);});
 test("both homes have independent destinations and TV focus",()=>{const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");expect(read("../src/routes/index.tsx")).toContain("<HomeFootball onWatch=");expect(read("../src/routes/tv-home.tsx")).toContain("<HomeFootball television");expect(read("../src/routes/tv-live.tsx")).toContain('from==="sports"||from==="home"');expect(read("../src/components/sports/HomeFootball.tsx")).toContain("home-sports-cards");});
});
