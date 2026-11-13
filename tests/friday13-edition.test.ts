import { describe,expect,test } from "bun:test";
import { FRIDAY13_START,FRIDAY13_END,isFriday13EditionActive,friday13NextBoundary,selectFriday13Movies } from "../src/lib/friday13-edition";
describe("one-day Friday 13 edition in Brasilia",()=>{
  test("uses the exact local day, including the UTC date change",()=>{
    expect(isFriday13EditionActive(FRIDAY13_START-1)).toBe(false);
    expect(isFriday13EditionActive(FRIDAY13_START)).toBe(true);
    expect(isFriday13EditionActive(Date.parse("2026-11-14T02:59:59.999Z"))).toBe(true);
    expect(isFriday13EditionActive(FRIDAY13_END)).toBe(false);
    expect(isFriday13EditionActive(Date.parse("2026-11-20T12:00:00-03:00"))).toBe(false);
    expect(isFriday13EditionActive(Date.parse("2027-08-13T12:00:00-03:00"))).toBe(false);
    expect(isFriday13EditionActive(NaN)).toBe(false);
  });
  test("schedules one boundary and stops scheduling after expiry",()=>{
    expect(friday13NextBoundary(FRIDAY13_START-1)).toBe(FRIDAY13_START);
    expect(friday13NextBoundary(FRIDAY13_START)).toBe(FRIDAY13_END);
    expect(friday13NextBoundary(FRIDAY13_END-1)).toBe(FRIDAY13_END);
    expect(friday13NextBoundary(FRIDAY13_END)).toBeNull();
  });
  test("selects only catalog franchise movies and preserves their routes",()=>{
    const original={id:"sextafeira 13 1980",title:"Sexta-Feira 13",type:"f",tmdbId:4488};
    const remake={id:"sextafeira 13",title:"Sexta-Feira 13",type:"f",tmdbId:13207};
    const items=[original,{...original,id:"alias-original"},remake,
      {id:"parody",type:"f",title:"Entrei em Pânico ao Saber o Que Vocês Fizeram na Sexta-feira 13 do Verão Passado"},
      {id:"comedy",type:"f",title:"Sexta-Feira Muito Louca"},
      {id:"doc",type:"s",title:"Sexta Feira 13 Assassinatos Reais"},
      {id:"series",type:"s",title:"Friday the 13th",tmdbId:4488}];
    expect(selectFriday13Movies(items)).toEqual([remake,original]);
    expect(items[0]).toBe(original);
    expect(selectFriday13Movies([])).toEqual([]);
  });
  test("recognizes localized continuations without inventing entries",()=>{
    const titles=["Sexta-Feira 13 - Parte IV: O Capítulo Final","Friday the 13th Part 2","Jason X","Jason Vai para o Inferno: A Última Sexta-Feira","Freddy vs. Jason"];
    const items=titles.map((title,n)=>({id:String(n),type:"f",title}));
    expect(selectFriday13Movies(items)).toEqual(items);
  });
});
