import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import type {CatalogItem} from "../src/lib/types";
import {indexTvLibrary,tvLibraryPage} from "../src/lib/tv-library-catalog";
import {tvGridColumns} from "../src/lib/tv-grid";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const make=(id:string,type:"f"|"s"|"a",genres:string[],alias=false):CatalogItem=>
  ({id,title:"Título "+id,type,genres,alias,streams:[],posterUrl:"https://image.tmdb.org/t/p/w500/"+id+".jpg"});
describe("Full 10-foot catalog",()=>{
  const catalog=new Map<string,CatalogItem>([
    ...Array.from({length:100},(_,i)=>["film-"+i,make("film-"+i,"f",i%2?["Ação","Aventura"]:["Terror"])] as const),
    ["series-1",make("series-1","s",["Drama"])],
    ["anime-1",make("anime-1","a",["Aventura"])],
    ["duplicate",make("film-1","f",["Ação"],true)],
  ]);
  test("every movie is reachable through bounded pages, no 26-title shelf cap",()=>{
    const p1=tvLibraryPage(catalog,"f","Todos",1,42);
    const p2=tvLibraryPage(catalog,"f","Todos",2,42);
    const p3=tvLibraryPage(catalog,"f","Todos",3,42);
    expect(p1.total).toBe(100);
    expect([p1.items.length,p2.items.length,p3.items.length]).toEqual([42,42,16]);
    expect(new Set([...p1.items,...p2.items,...p3.items].map(x=>x.id)).size).toBe(100);
    expect(p1.items.every(x=>!Object.hasOwn(x,"streams")&&!Object.hasOwn(x,"seasons"))).toBe(true);
  });
  test("filters genres using actual catalog metadata with correct counters",()=>{
    const horror=tvLibraryPage(catalog,"f","Terror",1,42);
    expect(horror.total).toBe(50);
    expect(horror.genres.find(g=>g.name==="Terror")?.count).toBe(50);
    expect(horror.genres.find(g=>g.name==="Ação")?.count).toBe(50);
    expect(horror.items.every(x=>x.genres.includes("Terror"))).toBe(true);
    expect(tvLibraryPage(catalog,"s","Todos",1).total).toBe(1);
    expect(tvLibraryPage(catalog,"a","Todos",1).total).toBe(1);
    expect(indexTvLibrary(catalog)).toBe(indexTvLibrary(catalog));
  });
  test("does not fetch a whole catalog for the TV genre navigation",()=>{
    const api=read("../src/server.ts");
    expect(api).toContain('url.searchParams.get("tv")==="library"');
    expect(api).toContain("tvLibraryPage(items");
    const home=read("../src/routes/tv-home.tsx");
    const library=read("../src/components/tv/TvLibrary.tsx");
    expect(home).toContain("<TvLibrary key={section} type={section} onOpen={openItem}/>");
    expect(library).toContain('tv:"library"');
    expect(library).toContain('data-tv-row="library-genres"');
    expect(library).toContain('className="zf-tv-library-grid"');
    expect(library).toContain("setPage(n=>n+1)");
    expect(library).not.toContain("getClientCatalog(");
  });
  test("native TV player has only one mute owner and hides HUD after 2 seconds",()=>{
    const live=read("../src/routes/tv-live.tsx");
    const stream=read("../src/components/player/TvStreamPlayer.tsx");
    const css=read("../src/styles/tv-cinema.css");
    expect(live).toContain("window.setTimeout(()=>setCinemaControls(false),2000)");
    expect(live).toContain("playerOpen:cinema&&!cinemaControls");
    expect(live).toContain("aria-hidden={!cinemaControls}");
    expect(live).toContain("volumechange");
    expect(live).toContain('data-tv-focus="cinema-mute"');
    expect(live).toContain('data-tv-focus="player-mute"');
    expect(stream).not.toContain('data-tv-focus="stream-mute"');
    expect(live).toContain("TvStreamPlayer key={active.id}");
    expect(css).toContain(".zf-tv-cinema-overlay.is-hidden");
    expect(css).not.toContain("backdrop-filter:");
  });
  test("D-pad rows match responsive CSS grid columns for 4K and smaller TVs",()=>{
    expect([1920,1300,950,700,480].map(w=>tvGridColumns(w,"library"))).toEqual([6,5,4,3,2]);
    expect([1920,1200,880,600].map(w=>tvGridColumns(w,"channels"))).toEqual([5,4,3,2]);
    expect(read("../src/components/tv/TvLibrary.tsx")).toContain("Math.floor(index/columns)");
    expect(read("../src/routes/tv-live.tsx")).toContain("Math.floor(i/columns)");
  });
  test("remote TV focus persists across genre and overlay state changes",()=>{
    const focus=read("../src/lib/tv-focus.ts");
    expect(focus).toContain("onBackRef.current");
    expect(focus).toContain("playerOpenRef.current");
    expect(focus).toContain("}, [route, root]);");
  });
});
