/**
 * Same-origin delivery of publicly accessible ESPN / TheSportsDB sports
 * portraits. The route is tightly allowlisted; it never forwards cookies,
 * authorization headers or redirects, and refuses non-image response types.
 */
const hosts=new Set(["a.espncdn.com","r2.thesportsdb.com","www.thesportsdb.com"]);
export function allowedSportsPortrait(raw:string):URL|null{
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:" || !hosts.has(url.hostname.toLowerCase()) ||
       url.port || url.username || url.password || url.hash ||
       url.pathname.length>280)return null;
    if(url.hostname==="a.espncdn.com" && !/^\/i\/headshots\/soccer\//.test(url.pathname))return null;
    if(url.hostname==="www.thesportsdb.com"&&!url.pathname.startsWith("/images/"))return null;
    if(url.hostname==="r2.thesportsdb.com"&&!url.pathname.startsWith("/images/"))return null;
    return url;
  }catch{return null;}
}
const formats=new Set(["image/png","image/jpeg","image/webp","image/avif"]);
export async function serveLineupPhoto(urlString:string):Promise<Response>{
  const url=allowedSportsPortrait(urlString);
  if(!url)return new Response(null,{status:400});
  try{
    const response=await fetch(url.toString(),{
      signal:AbortSignal.timeout(4500),
      redirect:"manual",
      headers:{Accept:"image/avif,image/webp,image/jpeg,image/png"},
    });
    if(!response.ok || response.status>=300)return new Response(null,{status:404});
    const mime=(response.headers.get("content-type")||"").split(";")[0]!.trim().toLowerCase();
    if(!formats.has(mime))return new Response(null,{status:415});
    const size=Number(response.headers.get("content-length"));
    if(Number.isFinite(size)&&size>2_000_000)return new Response(null,{status:413});
    const body=await response.arrayBuffer();
    if(body.byteLength<100||body.byteLength>2_000_000)
      return new Response(null,{status:413});
    return new Response(body,{status:200,headers:{
      "Content-Type":mime,
      "Cache-Control":"public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400",
      "X-Content-Type-Options":"nosniff",
    }});
  }catch{return new Response(null,{status:502});}
}
