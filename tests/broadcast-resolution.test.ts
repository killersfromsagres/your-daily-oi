import {describe,expect,test} from "bun:test";
import {resolveBroadcast,isFixtureProgramme,removeOverlappingBroadcastLinks} from "../src/lib/broadcast-resolution";
import {matchBrazilianBroadcastChannel} from "../src/lib/broadcast-match";
import {mergeFootballScores} from "../src/lib/football-ranking";
import type {JogoBrasileirao} from "../src/lib/jogos-match";
const time="2026-11-24T22:00:00Z",stamp="2026-11-24T20:00:00Z",ms=Date.parse(time);
const game=(id="one"):JogoBrasileirao=>({id,casa:"Flamengo",fora:"Palmeiras",escudoCasa:undefined,escudoFora:undefined,horarioLocal:"19:00",inicioIso:time,dataLocal:"2026-11-24",rodada:undefined,liga:"Brasileirão",ligaId:"bra.1",ligaLogo:null,grupo:"brasileirao",status:"agendado",placarCasa:null,placarFora:null,destaque:true,canalId:null,canalNome:null,canalLogo:null,transmissao:"nao-confirmada"});
const channels=["Premiere 2 HD","Premiere 3","SporTV 2","Globo RJ","Disney+","ESPN"].map((nome,i)=>({nome,id:String(i),fontes:[{url:"https://licensed.example/live"}]}));
describe("Event-specific Brazilian broadcast resolution",()=>{
 test("exact numbered channel and no arbitrary regional or streaming platform fallback",()=>{
  expect(matchBrazilianBroadcastChannel("Premiere02",channels)?.id).toBe("0");
  expect(matchBrazilianBroadcastChannel("Premiere",channels)).toBeNull();
  expect(matchBrazilianBroadcastChannel("SporTV",channels)).toBeNull();
  expect(matchBrazilianBroadcastChannel("Globo",channels)).toBeNull();
  expect(matchBrazilianBroadcastChannel("Disney+",channels)).toBeNull();
 });
 test("EPG rejects replays, pregame, news and wrong kickoff",()=>{
  const p={title:"Flamengo x Palmeiras",start:ms-600000,stop:ms+7200000};
  expect(isFixtureProgramme(p,game())).toBe(true);
  expect(isFixtureProgramme({...p,title:"Reprise Flamengo x Palmeiras"},game())).toBe(false);
  expect(isFixtureProgramme({...p,title:"Pré-jogo Flamengo x Palmeiras"},game())).toBe(false);
  expect(isFixtureProgramme({...p,title:"Notícias",desc:p.title},game())).toBe(false);
  expect(isFixtureProgramme({...p,start:ms+3600000},game())).toBe(false);
 });
 test("multiple actual broadcasters and source records survive canonical deduplication",()=>{
  const g=game();resolveBroadcast(g,[{nome:"Premiere 2",origem:"guia"},{nome:"SporTV 2",origem:"epg"},{nome:"Premiere 02 HD",origem:"espn"}],channels,[{id:"2",nome:"SporTV 2"}],stamp);
  expect(g.canalId).toBe("2");expect(g.canaisDisponiveis?.map(c=>c.id)).toEqual(["2","0"]);expect(g.canaisTransmissao).toHaveLength(2);expect(g.evidenciasTransmissao).toHaveLength(3);
 });
 test("Premiere official fallback coexists only with an exact fixture EPG channel",()=>{
  const g={...game(),transmissaoUrl:"https://globoplay.globo.com/canais/premiere/"};
  resolveBroadcast(g,[{nome:"Premiere",origem:"verificada"},{nome:"Premiere 3",origem:"guia"},{nome:"SporTV 2",origem:"epg"}],channels,[{id:"2",nome:"SporTV 2"}],stamp);
  expect(g.canalId).toBeNull();
  resolveBroadcast(g,[{nome:"Premiere",origem:"verificada"},{nome:"Premiere 2",origem:"epg"},{nome:"Premiere 3",origem:"guia"}],channels,[{id:"0",nome:"Premiere 2 HD"}],stamp);
  expect(g.canalId).toBe("0");expect(g.canaisDisponiveis?.map(c=>c.id)).toEqual(["0"]);
  expect(g.transmissaoUrl).toBe("https://globoplay.globo.com/canais/premiere/");
  resolveBroadcast(g,[{nome:"Premiere 2",origem:"epg"}],channels,[],stamp);
  expect(g.canalId).toBeNull();
 });
 test("exclusive non-Premiere streaming destinations remain external only",()=>{
  const g={...game(),transmissaoUrl:"https://www.primevideo.com/detail/ABC123"};
  resolveBroadcast(g,[{nome:"Premiere 2",origem:"epg"}],channels,[{id:"0",nome:"Premiere 2 HD"}],stamp);
  expect(g.canalId).toBeNull();
 });
 test("overlapping fixtures never silently share one channel",()=>{
  const a=game(),b={...game("two"),casa:"Santos",fora:"Corinthians"};
  resolveBroadcast(a,[{nome:"Premiere 2",origem:"guia"},{nome:"ESPN",origem:"espn"}],channels,[],stamp);
  resolveBroadcast(b,[{nome:"Premiere 2",origem:"guia"}],channels,[],stamp);
  removeOverlappingBroadcastLinks([a,b]);expect(a.canaisDisponiveis?.map(c=>c.id)).toEqual(["5"]);expect(b.canalId).toBeNull();expect(b.canaisDisponiveis).toEqual([]);
 });
 test("newer revocation clears old direct target and alternatives",()=>{
  const a=game();resolveBroadcast(a,[{nome:"Premiere 2",origem:"espn"}],channels,[],stamp);
  const b={...game(),transmissaoVerificadaEm:"2026-11-24T20:01:00Z"};
  const [r]=mergeFootballScores([a],[b],a.dataLocal);expect(r?.canalId).toBeNull();expect(r?.canaisDisponiveis).toBeUndefined();
  expect(mergeFootballScores([b],[a],a.dataLocal)[0]?.canalId).toBeNull();
 });
});
