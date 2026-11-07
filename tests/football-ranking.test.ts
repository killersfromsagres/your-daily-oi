// tests/football-ranking.test.ts — Bun: relevant TV shelf and complete sorted game day.
import { describe,expect,test } from "bun:test";
import { featuredFootballMatches, sortedFootballMatches, matchImportance } from "../src/lib/football-ranking";
import type { JogoBrasileirao } from "../src/lib/jogos-match";

function game(league:string,home:string,away:string,id:string):JogoBrasileirao {
  return {
    id,casa:home,fora:away,escudoCasa:undefined,escudoFora:undefined,
    horarioLocal:"16:00",inicioIso:"2026-11-07T19:00:00.000Z",dataLocal:"2026-11-07",
    rodada:undefined,liga:league,ligaId:league,ligaLogo:null,
    grupo:"internacional",status:"agendado",placarCasa:null,placarFora:null,
    destaque:false,canalId:null,canalNome:null,canalLogo:null,
    transmissao:"nao-confirmada",
  };
}
describe("Zang Flix football relevance",()=>{
  const a=game("bra.1","Flamengo","Palmeiras","a");
  const b=game("uefa.champions","Real Madrid","Bayern Munich","b");
  const c=game("eng.1","Manchester City","Arsenal","c");
  const d=game("bra.2","Novorizontino","Fortaleza","d");
  const e=game("ger.1","Mainz","Elversberg","e");
  test("keeps Brasil A and Champions in highlighted list",()=>{
    const selected=featuredFootballMatches([e,d,c,b,a],8);
    expect(selected.map(x=>x.id)).toContain("a");
    expect(selected.map(x=>x.id)).toContain("b");
    expect(selected.map(x=>x.id)).toContain("c");
    expect(selected.map(x=>x.id)).not.toContain("e");
  });
  test("TV shelf limits to eight, full guide never truncates",()=>{
    const many=Array.from({length:20},(_,i)=>game("bra.1","Palmeiras","Corinthians","g"+i));
    expect(featuredFootballMatches(many).length).toBe(8);
    expect(sortedFootballMatches(many).length).toBe(20);
  });
  test("no fixture disappears from full day due to popularity",()=>{
    const sorted=sortedFootballMatches([e,d,c,b,a]);
    expect(sorted).toHaveLength(5);
    expect(new Set(sorted.map(g=>g.id)).size).toBe(5);
    expect(sorted.findIndex(g=>g.id==="e")).toBeGreaterThan(sorted.findIndex(g=>g.id==="a"));
  });
  test("live state gives extra relevance to current matches",()=>{
    const live={...a,status:"ao-vivo" as const};
    expect(matchImportance(live)).toBeGreaterThan(matchImportance(a));
  });
  test("identified broadcaster does not become invented for others",()=>{
    expect(a.canalId).toBeNull();
    expect(b.canalId).toBeNull();
    const valid={...b,canalId:"espn",canalNome:"ESPN"};
    expect(matchImportance(valid)).toBeGreaterThan(matchImportance(b));
  });
});
