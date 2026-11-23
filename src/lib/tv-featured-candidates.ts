import {normalizeHeroTitle} from "./hero-rotation";
type Candidate={id:string;title:string;type:"f"|"s"|"a";posterUrl?:string;tmdbId?:number|null;tmdb?:{backdropUrl?:string|null}|null};
type Highlights={items:readonly {title:string;type:"f"|"s"|"a"}[]};
export function selectTvHeroCandidates<T extends Candidate>(
  items:readonly T[],highlights:readonly Highlights[],known:Readonly<Record<string,string>>,
  curated:readonly string[],limit=16,
):T[]{
  const keys=curated.map(normalizeHeroTitle);
  const featured=new Set(highlights.flatMap(h=>h.items).filter(it=>it.type==="f").map(it=>normalizeHeroTitle(it.title)));
  const knownKeys=Object.keys(known).map(normalizeHeroTitle);
  const seen=new Set<string>();
  return items.flatMap(item=>{
    if(item.type!=="f"||!item.posterUrl||seen.has(item.id))return [];
    seen.add(item.id);
    const name=normalizeHeroTitle(item.title);
    const curatedIndex=keys.findIndex(key=>key===name||name.startsWith(key+" "));
    const knownIndex=knownKeys.findIndex(key=>key===name||name.startsWith(key+" "));
    const artwork=Boolean(item.tmdb?.backdropUrl)||knownIndex>=0;
    if(!artwork&&!item.tmdbId)return [];
    return [{item,score:(curatedIndex>=0?350-curatedIndex*8:0)+
      (featured.has(name)?150:0)+(artwork?120:0)+(item.tmdbId?30:0)}];
  }).sort((a,b)=>b.score-a.score||a.item.title.localeCompare(b.item.title,"pt-BR"))
    .slice(0,Math.max(0,limit)).map(x=>x.item);
}
