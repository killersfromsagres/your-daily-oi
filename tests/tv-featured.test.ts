import {describe,expect,test} from "bun:test";
import {selectTvFeatured,tvBackdropHd} from "../src/lib/tv-featured";
const films=[
  {id:"a",type:"f" as const,title:"Oppenheimer",posterUrl:"https://example.com/a.jpg",tmdb:null},
  {id:"b",type:"f" as const,title:"Interestelar",posterUrl:"https://example.com/b.jpg",tmdb:{backdropUrl:"https://image.tmdb.org/t/p/original/real.jpg",overview:"Uma jornada espacial",releaseYear:2014,voteAverage:8.5}},
  {id:"c",type:"f" as const,title:"Desconhecido",posterUrl:"https://example.com/c.jpg",tmdb:null},
  {id:"d",type:"s" as const,title:"Oppenheimer",posterUrl:"https://example.com/d.jpg",tmdb:null}
];
test("Only genuine catalog movies with landscape artwork enter TV hero",()=>{
 const heroes=selectTvFeatured(films,[],{"oppenheimer":"https://image.tmdb.org/t/p/original/oppen.jpg"},["oppenheimer","interestelar"],0,8);
 expect(heroes.map(h=>h.id).sort()).toEqual(["a","b"]);
 expect(heroes.every(h=>h.backdropUrl.includes("/w1280/"))).toBe(true);
 expect(heroes.find(h=>h.id==="b")?.overview).toBe("Uma jornada espacial");
});
test("banners rotate deterministically, do not invent movies or use posters",()=>{
 const a=selectTvFeatured(films,[],{"oppenheimer":"https://image.tmdb.org/t/p/original/oppen.jpg"},["oppenheimer","interestelar"],0,8);
 const b=selectTvFeatured(films,[],{"oppenheimer":"https://image.tmdb.org/t/p/original/oppen.jpg"},["oppenheimer","interestelar"],1800000,8);
 expect(a.map(x=>x.id)).not.toEqual(b.map(x=>x.id));
 expect(a.map(x=>x.id).sort()).toEqual(b.map(x=>x.id).sort());
 expect(tvBackdropHd("https://example.com/banner.jpg")).toBe("https://example.com/banner.jpg");
});
