import { describe,expect,test } from "bun:test";
import { ZANGS_PICKS,selectZangsPicks } from "../src/lib/zangs-picks";
import type { CatalogItem } from "../src/lib/types";

const movie=(id:number,type:CatalogItem["type"]="f"):CatalogItem=>({
  id:"catalog-"+id,title:"Título do catálogo",type,tmdbId:id,genres:["Terror"],streams:[],
});

describe("Mais terror na sua noite",()=>{
  test("shows all requested editions first and keeps the previous picks except Hereditário",()=>{
    const fixture=ZANGS_PICKS.map(p=>movie(p.tmdbId)).reverse();
    const results=selectZangsPicks([
      ...fixture,movie(493922),movie(259693),movie(630586),
      {...movie(4488),id:"duplicate",alias:true},
    ]);
    expect(ZANGS_PICKS).toHaveLength(14);
    expect(results.map(p=>p.tmdbId)).toEqual([
      4488,9730,13207,377,948,694,3021,561,
      138843,9902,1690,1691,71670,530385,
    ]);
    expect(results.every(p=>p.tmdbId!==493922)).toBe(true);
    expect(results.map(p=>p.id)).toEqual(ZANGS_PICKS.map(p=>"catalog-"+p.tmdbId));
  });

  test("distinguishes the classic Friday the 13th from its 2009 remake",()=>{
    const results=selectZangsPicks([movie(13207),movie(4488),movie(9730)]);
    expect(results.map(p=>p.title)).toEqual([
      "Sexta-Feira 13 (1980)",
      "Sexta-Feira 13: O Capítulo Final",
      "Sexta-Feira 13 (2009)",
    ]);
  });

  test("relabels Freddy, Halloween, The Shining, 1408 and Constantine without changing their playable sources",()=>{
    const original=movie(377);
    original.title="A Nightmare on Elm Street";
    original.streams=[{url:"https://media.example.org/film.mp4",audio:"dub"}];
    const results=selectZangsPicks([original,movie(948),movie(694),movie(3021),movie(561)]);
    expect(results.map(p=>p.title)).toEqual([
      "A Hora do Pesadelo",
      "Halloween: A Noite do Terror",
      "O Iluminado",
      "1408",
      "Constantine",
    ]);
    expect(results[0]?.streams).toBe(original.streams);
    expect(original.title).toBe("A Nightmare on Elm Street");
  });

  test("accepts an exact legacy movie without TMDB ID only when its year is known",()=>{
    const  original={...movie(0),id:"old-friday",title:"Sexta-Feira 13",
      catalogTitle:"Sexta-Feira 13 (1980)",tmdbId:null};
    const chosen=selectZangsPicks([original]);
    expect(chosen.map(m=>m.title)).toEqual(["Sexta-Feira 13 (1980)"]);
    expect(chosen[0]?.id).toBe(original.id);
    expect(selectZangsPicks([{...original,catalogTitle:"Sexta-Feira 13"}])).toEqual([]);
    expect(selectZangsPicks([{...original,catalogTitle:"Sexta-Feira 13 (2009)"}]).map(m=>m.title))
      .toEqual(["Sexta-Feira 13 (2009)"]);
  });

  test("never invents missing titles or substitutes unrelated remakes/series",()=>{
    expect(selectZangsPicks([])).toEqual([]);
    expect(selectZangsPicks([movie(4488,"s"),movie(259693),movie(493922)])).toEqual([]);
    expect(selectZangsPicks([movie(1691)]).map(m=>m.title)).toEqual(["O Albergue 2"]);
  });
});
