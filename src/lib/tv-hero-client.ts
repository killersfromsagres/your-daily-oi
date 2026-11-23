/** Tolerate the older /api/destaques contract while the TV host is being
 * synchronized. This never fabricates movie IDs or image URLs. */
export interface TvHeroDisplay{
  id:string;type:"f"|"s"|"a";title:string;posterUrl:string;backdropUrl:string;
  overview:string;year:number|null;rating:number|null;
}
export function tvHeroesFromResponse(input:unknown):TvHeroDisplay[]{
  if(!input||typeof input!=="object")return [];
  const body=input as Record<string,unknown>;
  const source=Array.isArray(body["heroes"])?body["heroes"]:
    Array.isArray(body["featuredHero"])?body["featuredHero"]:[];
  const ids=new Set<string>();
  const result:TvHeroDisplay[]=[];
  for(const raw of source){
    if(!raw||typeof raw!=="object")continue;
    const item=raw as Record<string,unknown>;
    const meta=(item["tmdb"]&&typeof item["tmdb"]==="object")
      ?item["tmdb"] as Record<string,unknown>:{};
    const id=typeof item["id"]==="string"?item["id"]:"";
    const title=typeof item["title"]==="string"?item["title"]:"";
    const type=item["type"];
    const image=typeof item["backdropUrl"]==="string"?item["backdropUrl"]:
      typeof meta["backdropUrl"]==="string"?meta["backdropUrl"]:"";
    if(!id||!title||ids.has(id)||!["f","s","a"].includes(String(type))||
      !/^https:\/\//i.test(image))continue;
    ids.add(id);
    const poster=typeof item["posterUrl"]==="string"?item["posterUrl"]:"";
    const overview=typeof item["overview"]==="string"?item["overview"]:
      typeof meta["overview"]==="string"?meta["overview"]:"";
    const year=typeof item["year"]==="number"?item["year"]:
      typeof meta["releaseYear"]==="number"?meta["releaseYear"]:null;
    const rating=typeof item["rating"]==="number"?item["rating"]:
      typeof meta["voteAverage"]==="number"?meta["voteAverage"]:null;
    result.push({id,type:type as TvHeroDisplay["type"],title,posterUrl:poster,
      backdropUrl:image,overview,year,rating});
    if(result.length>=8)break;
  }
  return result;
}
