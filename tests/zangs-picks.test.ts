import { describe,expect,test } from "bun:test";
import { ZANGS_PICKS,selectZangsPicks } from "../src/lib/zangs-picks";
import type { CatalogItem } from "../src/lib/types";

const movie = (id:number,type:CatalogItem["type"]="f"):CatalogItem => ({
  id:"catalog-"+id,title:"Título do catálogo",type,tmdbId:id,genres:["Terror"],streams:[],
});
describe("Escolha do Zangs",()=>{
  test("keeps the seven requested editions in editorial order and removes aliases",()=>{
    const movies=ZANGS_PICKS.map(p=>movie(p.tmdbId)).reverse();
    const selected=selectZangsPicks([...movies,movie(259693),movie(630586),{...movie(1690),id:"alias"}]);
    expect(selected.map(m=>m.tmdbId)).toEqual([138843,9902,1690,1691,71670,493922,530385]);
    expect(selected.map(m=>m.id)).toEqual(ZANGS_PICKS.map(p=>"catalog-"+p.tmdbId));
  });
  test("uses canonical Portuguese labels without mutating catalog items or sources",()=>{
    const original=movie(493922);original.title="Hereditario";
    const [result]=selectZangsPicks([original]);
    expect(result.title).toBe("Hereditário");
    expect(result.streams).toBe(original.streams);
    expect(original.title).toBe("Hereditario");
  });
  test("never invents missing entries or substitutes series",()=>{
    expect(selectZangsPicks([])).toEqual([]);
    expect(selectZangsPicks([movie(138843,"s"),movie(259693)])).toEqual([]);
    expect(selectZangsPicks([movie(1691)]).map(m=>m.title)).toEqual(["O Albergue 2"]);
  });
});
