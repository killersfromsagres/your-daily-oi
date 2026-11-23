// Production-only contract probe. This does not request video or print stream URLs.
const origin=(process.env.TV_AUDIT_ORIGIN||"https://zangflix.lovable.app").replace(/\/$/,"");
const expected=process.env.TV_AUDIT_VERSION||"2.4.0";
const base=new URL(origin);
if(base.protocol!=="https:")throw Error("Only HTTPS deployment origins can be checked");
async function probe(path,readJson=false){
  const url=new URL(path,base);
  try{
    const res=await fetch(url,{signal:AbortSignal.timeout(12000),cache:"no-store",
      headers:{Accept:readJson?"application/json":"text/html","Cache-Control":"no-cache"}});
    const type=res.headers.get("content-type")||"";
    const result={path:url.pathname,status:res.status,type:type.split(";")[0],redirected:res.redirected,
      marker:res.headers.get("x-zang-tv-build")||null};
    if(readJson && res.ok && /json/.test(type)){
      const raw=await res.text();
      if(raw.length>6_000_000)throw Error("Response unexpectedly large");
      const body=JSON.parse(raw);
      if(path.includes("catalogo")){
        result.rows=Array.isArray(body.rows)?body.rows.length:0;
        result.movies=Array.isArray(body.rows)
          ?body.rows.reduce((count,row)=>count+(row.type==="f"?(row.items?.length||0):0),0):0;
        result.heroCount=Array.isArray(body.heroes)?body.heroes.filter(h=>h?.backdropUrl).length:0;
        result.legacyShape=Boolean(body.items && !body.rows);
      }else if(path.includes("featured")){
        result.heroCount=Array.isArray(body.heroes)?body.heroes.filter(h=>h?.backdropUrl).length:0;
      }else if(path.includes("destaques")){
        result.heroCount=Array.isArray(body.featuredHero)?
          body.featuredHero.filter(h=>Boolean(h?.tmdb?.backdropUrl)).length:0;
      }else if(path.includes("canais")){
        result.channelCount=Array.isArray(body.canais)?body.canais.length:0;
        result.sources=Array.isArray(body.canais)?body.canais.reduce((n,ch)=>n+(ch.fontes?.length||0),0):0;
        result.samples=["cazé","band sports"].map(name=>{
          const found=(body.canais||[]).find(ch=>String(ch.nome||"").normalize("NFD")
            .replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()));
          return {name,found:Boolean(found),sources:found?.fontes?.length||0};
        });
      }else if(path.includes("build")){
        result.version=String(body.version||"");
        result.ok=result.version===expected;
      }
    }else if(!readJson){
      const html=(await res.text()).slice(0,150000);
      result.tvAppMarker=html.includes("data-tv-build")||html.includes("zf-tenfoot-home");
      result.oldPlayerMarker=html.includes("Sintonizando");
      result.htmlBytes=html.length;
    }
    return result;
  }catch(e){return {path:url.pathname,error:e?.name||"RequestError"}}
}
const paths=[
  ["/tv-home?zf-tv-app=androidtv&tv-audit=1",false],
  ["/api/tv/build",true],
  ["/api/catalogo?tv=1",true],
  ["/api/tv/featured",true],
  ["/api/destaques",true],
  ["/api/canais",true],
  ["/api/tv/stream?canal=%21&fonte=0",false],
];
const results=await Promise.all(paths.map(([path,json])=>probe(path,json)));
for(const result of results)console.log(JSON.stringify({event:"tv-production-check",origin:base.origin,...result}));
const build=results[1],catalog=results[2],featured=results[3],legacy=results[4],channels=results[5];
const healthy=build?.status===200&&build.version===expected
  &&catalog?.status===200&&catalog.rows>0
  &&(catalog.heroCount>0||featured?.heroCount>0)
  &&channels?.status===200&&channels.channelCount>0;
console.log(JSON.stringify({event:"tv-production-summary",origin:base.origin,healthy,expected,
  build:build?.version||null,heroes:Math.max(0,catalog?.heroCount||0,featured?.heroCount||0),
  channels:channels?.channelCount||0,
  note:healthy?"API surface present; actual video playback not proven":
    "Production app does not satisfy TV contract. GitHub merges and APK updates cannot repair an unsynced origin.",
  legacyHeroCount:legacy?.heroCount||0})); 
if(!healthy)console.log("::warning::ZANG FLIX TV runtime is outdated or missing banners at "+base.origin);
if(!healthy&&process.env.TV_AUDIT_STRICT==="1")process.exitCode=1;
