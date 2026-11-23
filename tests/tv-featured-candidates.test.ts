import {test,expect} from "bun:test";
import {selectTvHeroCandidates} from "../src/lib/tv-featured-candidates";
test("prioritizes real curated catalog titles with actual HD candidates",()=>{
  const candidates=[
    {id:"a",type:"f" as const,title:"Duna: Parte Dois",posterUrl:"https://a",tmdbId:693134},
    {id:"b",type:"f" as const,title:"Outro filme",posterUrl:"https://b",tmdbId:9},
    {id:"c",type:"s" as const,title:"Duna",posterUrl:"https://c",tmdbId:1},
    {id:"d",type:"f" as const,title:"Sem metadados",posterUrl:"https://d"},
  ];
  const r=selectTvHeroCandidates(candidates,[],{"duna":"https://image.tmdb.org/t/p/w1280/test.jpg"},["duna"],12);
  expect(r.map(it=>it.id)).toEqual(["a","b"]);
});
