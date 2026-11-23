/** Fetch only the authorized TMDB movie details needed for a TV hero.
 * Unlike getTmdbData, this does NOT fetch credits, videos or large image sets.
 * The caller still verifies the film is in the site's own catalog.
 */
interface TvArt {backdropUrl:string;overview:string;year:number|null;rating:number}
const BASE="https://api.themoviedb.org/3";
const TOKEN=process.env.TMDB_READ_TOKEN;
const FALLBACK_TOKEN=""; // Never embed a runtime token in the browser bundle.
export async function getTvHeroArt(tmdbId:number):Promise<TvArt|null>{
  if(!Number.isSafeInteger(tmdbId)||tmdbId<=0)return null;
  const bearer=TOKEN||FALLBACK_TOKEN;
  const key=process.env.TMDB_API_KEY;
  if(!bearer&&!key)return null;
  const url=new URL(BASE+"/movie/"+tmdbId);
  url.searchParams.set("language","pt-BR");
  if(!bearer&&key)url.searchParams.set("api_key",key);
  try{
    const response=await fetch(url.toString(),{
      headers:bearer?{Authorization:"Bearer "+bearer}:undefined,
      signal:AbortSignal.timeout(4600),
    });
    if(!response.ok)return null;
    const data=await response.json() as Record<string,unknown>;
    const backdrop=typeof data["backdrop_path"]==="string"?data["backdrop_path"]:"";
    if(!/^\/[a-z0-9_\-/]+\.(jpg|png|webp)$/i.test(backdrop))return null;
    const date=typeof data["release_date"]==="string"?data["release_date"]:"";
    const year=/^\d{4}-/.test(date)?Number(date.slice(0,4)):null;
    return {
      backdropUrl:"https://image.tmdb.org/t/p/w1280"+backdrop,
      overview:typeof data["overview"]==="string"?data["overview"]:"",
      rating:typeof data["vote_average"]==="number"?data["vote_average"]:0,
      year,
    };
  }catch{return null}
}
