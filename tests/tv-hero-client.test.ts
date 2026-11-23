import {test,expect} from "bun:test";
import {tvHeroesFromResponse} from "../src/lib/tv-hero-client";
test("legacy featuredHero and newer TV heroes both return validated HD posters",()=>{
 const raw={featuredHero:[
  {id:"a",type:"f",title:"Duna",posterUrl:"https://example.com/poster.jpg",
   tmdb:{backdropUrl:"https://image.tmdb.org/t/p/original/duna.jpg",voteAverage:8.2,overview:"Teste"}},
  {id:"b",type:"f",title:"B",tmdb:{backdropUrl:""}}
 ]};
 expect(tvHeroesFromResponse(raw).map(x=>x.id)).toEqual(["a"]);
 expect(tvHeroesFromResponse(raw)[0]?.rating).toBe(8.2);
 expect(tvHeroesFromResponse({heroes:[]})).toEqual([]);
});
