/** Full catalog index for the dedicated 10-foot TV UI only.
 * The original TV homepage intentionally has small featured rails, while
 * browsing films, series, anime must page through every canonical title.
 * This indexes metadata only: no stream URLs, episodes or TMDB hydration.
 */
import type {CatalogItem} from "./types";
import {cleanDisplayTitle} from "./catalog";

export type TvLibraryType="f"|"s"|"a";
export interface TvLibraryTile{
  id:string;type:TvLibraryType;title:string;posterUrl:string;genres:string[];
}
export interface TvLibraryResult{
  type:TvLibraryType;genre:string;page:number;pageSize:number;
  total:number;pageCount:number;items:TvLibraryTile[];
  genres:Array<{name:string;count:number}>;
}
const INDEX=new WeakMap<Map<string,CatalogItem>,Record<TvLibraryType,TvLibraryTile[]>>();
const n=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
export function indexTvLibrary(catalog:Map<string,CatalogItem>):Record<TvLibraryType,TvLibraryTile[]>{
  const old=INDEX.get(catalog);if(old)return old;
  const data:Record<TvLibraryType,TvLibraryTile[]>={f:[],s:[],a:[]};
  const seen=new Set<string>();
  for(const item of catalog.values()){
    if(item.alias||!["f","s","a"].includes(item.type))continue;
    const key=item.type+":"+item.id;
    if(seen.has(key))continue;
    seen.add(key);
    data[item.type].push({
      id:item.id,type:item.type,title:cleanDisplayTitle(item.title),
      posterUrl:(item.posterUrl||"").replace(
        /^https:\/\/image\.tmdb\.org\/t\/p\/(?:original|w\d+)\//i,
        "https://image.tmdb.org/t/p/w500/"),
      genres:(item.genres||[]).filter(Boolean),
    });
  }
  const sort=(a:TvLibraryTile,b:TvLibraryTile)=>
    a.title.localeCompare(b.title,"pt-BR",{sensitivity:"base"})||a.id.localeCompare(b.id);
  data.f.sort(sort);data.s.sort(sort);data.a.sort(sort);
  INDEX.set(catalog,data);
  return data;
}
export function tvLibraryPage(catalog:Map<string,CatalogItem>,type:TvLibraryType,
  genre:string,page:number,pageSize=42):TvLibraryResult{
  const all=indexTvLibrary(catalog)[type];
  const counts=new Map<string,{name:string;count:number}>();
  for(const item of all)for(const label of new Set(item.genres.map(n))){
    if(!label)continue;
    const current=counts.get(label);
    if(current)current.count++;
    else counts.set(label,{name:item.genres.find(g=>n(g)===label)!,count:1});
  }
  const genres=[...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"pt-BR"));
  const safeGenre=genre&&genre!=="Todos"&&counts.has(n(genre))
    ?counts.get(n(genre))!.name:"Todos";
  const match=safeGenre==="Todos"?all:all.filter(item=>item.genres.some(g=>n(g)===n(safeGenre)));
  const safeSize=Math.min(60,Math.max(12,Math.floor(pageSize)||42));
  const pages=Math.max(1,Math.ceil(match.length/safeSize));
  const safePage=Math.max(1,Math.min(pages,Math.floor(page)||1));
  return {type,genre:safeGenre,page:safePage,pageSize:safeSize,
    total:match.length,pageCount:pages,
    items:match.slice((safePage-1)*safeSize,safePage*safeSize),genres};
}
