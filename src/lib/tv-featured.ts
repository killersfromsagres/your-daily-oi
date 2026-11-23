import { HERO_ROTATION_MS, normalizeHeroTitle } from "./hero-rotation";

/** A tiny, cache-friendly TV manifest; no streaming URLs or episode trees. */
export interface TvFeaturedItem {
  id:string; title:string; type:"f"|"s"|"a"; posterUrl:string;
  backdropUrl:string; overview:string; year:number|null; rating:number|null;
}
type Candidate={
  id:string; title:string; type:"f"|"s"|"a"; posterUrl?:string;
  tmdb?: {backdropUrl?:string|null;overview?:string|null;releaseYear?:number|null;voteAverage?:number|null}|null;
};
type Highlights={items:Array<{title:string;type:"f"|"s"|"a"}>};

/** Use TMDB's validated HD transform for backdrops; original is too heavy for many TVs.
 * Media paths are unchanged. Only the image rendition size is normalized.
 */
export function tvBackdropHd(url:string):string {
  if(!/^https:\/\/image\.tmdb\.org\/t\/p\/(?:original|w\d+)\//i.test(url))return url;
  return url.replace(/\/t\/p\/(?:original|w\d+)\//i,"/t/p/w1280/");
}
export function selectTvFeatured(
  items:readonly Candidate[],
  highlights:readonly Highlights[],
  knownHdBackdrops:Readonly<Record<string,string>>,
  curatedQueries:readonly string[],
  now=Date.now(),
  limit=7,
):TvFeaturedItem[] {
  const important=curatedQueries.map(normalizeHeroTitle);
  const highlighted=new Set(highlights.flatMap(row=>row.items)
    .filter(item=>item.type==="f").map(item=>normalizeHeroTitle(item.title)));
  const collected=new Set<string>();
  const choices=items.flatMap(item=>{
    if(item.type!=="f"||!item.posterUrl)return [];
    const title=normalizeHeroTitle(item.title);
    if(!title||collected.has(item.id))return [];
    collected.add(item.id);
    const index=important.findIndex(query=>title.includes(query));
    const fallback=Object.entries(knownHdBackdrops).find(([key])=>
      title===normalizeHeroTitle(key)||title.startsWith(normalizeHeroTitle(key)+" "))?.[1];
    const image=item.tmdb?.backdropUrl||fallback;
    // Never stretch portrait posters into the cinematic hero.
    if(!image||!/^https:\/\//i.test(image))return [];
    const score=(index>=0?200-index*11:0)+(highlighted.has(title)?55:0)+
      Math.min(10,Math.max(0,item.tmdb?.voteAverage||0))*2;
    return [{score,item,backdropUrl:tvBackdropHd(image)}];
  });
  choices.sort((a,b)=>b.score-a.score||a.item.title.localeCompare(b.item.title,"pt-BR"));
  const count=Math.min(Math.max(0,limit),choices.length);
  const selected=choices.slice(0,count);
  if(!selected.length)return [];
  // Change starting banner between sessions, but keep the list stable.
  const offset=Math.floor(Math.max(0,now)/HERO_ROTATION_MS)%selected.length;
  return [...selected.slice(offset),...selected.slice(0,offset)].map(({item,backdropUrl})=>({
    id:item.id,type:item.type,title:item.title,posterUrl:item.posterUrl!,
    backdropUrl,overview:item.tmdb?.overview||"",
    year:item.tmdb?.releaseYear??null,rating:item.tmdb?.voteAverage??null,
  }));
}
