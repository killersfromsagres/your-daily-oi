import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight, ChevronLeft, Clapperboard, Film, Heart, House, Info, ListVideo, Play, Search, Sparkles, Tv2, X } from "lucide-react";
import { useLiveSuggestions } from "@/components/search/useLiveSuggestions";
import { getProgress, getSavedList, toggleSaved } from "@/lib/storage";
import { useTvFocus, tvReadFocus } from "@/lib/tv-focus";
import { remoteKey } from "@/lib/tv-remote";
import {TV_APP_BUILD} from "@/lib/tv-build";
import {tvHeroesFromResponse} from "@/lib/tv-hero-client";
import type { SearchSuggestion } from "@/lib/search-suggestions";

type MediaType = "f" | "s" | "a";
interface TvItem { id:string; type:MediaType; title:string; posterUrl:string; backdropUrl?:string; overview?:string; year?:number|null; rating?:number|null }
interface TvRow { id:string; title:string; type:MediaType; items:TvItem[] }
interface TvPayload { rows:TvRow[]; heroes?:TvItem[]; hero?:TvItem|null }
type Section = "all" | MediaType | "saved";
const navOptions:ReadonlyArray<{key:Section;title:string}> = [
  {key:"all",title:"Início"},{key:"f",title:"Filmes"},{key:"s",title:"Séries"},{key:"a",title:"Animes"},{key:"saved",title:"Minha lista"}
];
const mediaLabel:Record<MediaType,string> = {f:"FILME",s:"SÉRIE",a:"ANIME"};

export const Route=createFileRoute("/tv-home")({
  component:TvHome,
  head:()=>({meta:[{title:"ZANG FLIX TV — Descubra seu próximo filme"}]})
});

function TvHome(){
  const navigate=useNavigate();
  const root=useRef<HTMLElement>(null);
  const searchInput=useRef<HTMLInputElement>(null);
  const requestedExtraArtwork=useRef(false);
  const [section,setSection]=useState<Section>("all");
  const [rows,setRows]=useState<TvRow[]>([]);
  const [hero,setHero]=useState<TvItem|null>(null);
  const [heroes,setHeroes]=useState<TvItem[]>([]);
  const [heroIndex,setHeroIndex]=useState(0);
  const [failedBackdrops,setFailedBackdrops]=useState<string[]>([]);
  const [serverOutdated,setServerOutdated]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [saved,setSaved]=useState<string[]>([]);
  const [progress,setProgress]=useState<string[]>([]);
  const {suggestions,status}=useLiveSuggestions(query,searchOpen);
  const onBack=useCallback(()=>{
    if(searchOpen){setSearchOpen(false);setQuery("");requestAnimationFrame(()=>document.querySelector<HTMLElement>('[data-tv-focus="open-search"]')?.focus());}
    else if(section!=="all")setSection("all");
    else if(window.history.length>1)window.history.back();
  },[searchOpen,section,navigate]);
  useTvFocus({route:"home",root,onBack});

  useEffect(()=>{
    setSaved(getSavedList());
    setProgress(getProgress().filter(p=>p.currentTime>30).map(p=>p.contentId||p.id));
    const controller=new AbortController();
    fetch("/api/catalogo?tv=1",{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error("Erro "+r.status);return r.json() as Promise<TvPayload>})
      .then(data=>{
        if(controller.signal.aborted)return;
        const valid=Array.isArray(data.rows)?data.rows.filter(r=>Array.isArray(r.items)):[];
        setRows(valid);
        setHero(data.hero||valid.flatMap(r=>r.items)[0]||null);
        setHeroes(tvHeroesFromResponse(data));
        setHeroIndex(0);
      })
      .catch(()=>{if(!controller.signal.aborted)setError(true)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[]);
  useEffect(()=>{
    // The native APK may be newer than the web service at its configured host.
    // Report a version mismatch instead of silently showing an empty banner.
    const controller=new AbortController();
    void fetch("/api/tv/build",{signal:controller.signal,cache:"no-store"})
      .then(async response=>response.ok?response.json():null)
      .then(data=>{if(!controller.signal.aborted)setServerOutdated(!data||data.version!==TV_APP_BUILD)})
      .catch(()=>{if(!controller.signal.aborted)setServerOutdated(true)});
    return()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(loading||heroes.length>=8||requestedExtraArtwork.current)return;
    requestedExtraArtwork.current=true;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>controller.abort(),19000);
    const fetchHeroes=async(path:string)=>{
      const response=await fetch(path,{signal:controller.signal,cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const data:unknown=await response.json();
      return tvHeroesFromResponse(data);
    };
    void (async()=>{
      let selection:TvItem[]=[];
      try{selection=await fetchHeroes("/api/tv/featured")}
      catch{
        // Older deployed backends supplied this endpoint long before /api/tv/featured.
        try{selection=await fetchHeroes("/api/destaques")}catch{}
      }
      if(controller.signal.aborted)return;
      setHeroes(current=>{
        const unique=new Map(current.map(item=>[item.id,item] as const));
        for(const item of selection)if(!unique.has(item.id))unique.set(item.id,item);
        return [...unique.values()].slice(0,8);
      });
    })().finally(()=>window.clearTimeout(timer));
    return()=>{controller.abort();window.clearTimeout(timer)};
  },[loading,heroes.length]);

  useEffect(()=>{
    if(!searchOpen)return;
    const frame=requestAnimationFrame(()=>searchInput.current?.focus({preventScroll:true}));
    return()=>cancelAnimationFrame(frame);
  },[searchOpen]);

  // Shelves render after the compact API returns. Restore the last movie
  // selection only when the user has not started navigating somewhere else.
  useEffect(()=>{
    if(loading||searchOpen)return;
    const id=tvReadFocus("home");
    if(!id.startsWith("poster-"))return;
    const frame=requestAnimationFrame(()=>{
      const element=[...root.current?.querySelectorAll<HTMLElement>("[data-tv-focus]")||[]]
        .find(node=>node.dataset["tvFocus"]===id);
      if(element)element.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[loading,searchOpen]);

  const allItems=useMemo(()=>rows.flatMap(r=>r.items),[rows]);
  const uniqueSaved=useMemo(()=>allItems.filter((item,i)=>saved.includes(item.id)&&allItems.findIndex(other=>other.id===item.id)===i).slice(0,20),[allItems,saved]);
  const watching=useMemo(()=>allItems.filter((item,i)=>progress.includes(item.id)&&allItems.findIndex(other=>other.id===item.id)===i).slice(0,18),[allItems,progress]);
  const shelves=useMemo(()=>{
    const base=section==="all"?rows:section==="saved"?[]:rows.filter(row=>row.type===section);
    const leading:TvRow[]=[];
    if((section==="saved"||section==="all")&&uniqueSaved.length)leading.push({id:"saved",title:"Minha lista",type:"f",items:uniqueSaved});
    if(section==="all"&&watching.length)leading.unshift({id:"continue",title:"Continue assistindo",type:"f",items:watching});
    return [...leading,...base];
  },[rows,section,uniqueSaved,watching]);

  const openItem=useCallback((item:Pick<TvItem,"id"|"type">)=>{
    void navigate({to:"/tv-title",search:{id:item.id,type:item.type}});
  },[navigate]);
  const addSaved=()=>{
    if(!spotlight)return;
    toggleSaved(spotlight.id);setSaved(getSavedList());
  };
  const playHero=()=>{
    if(!spotlight)return;
    if(spotlight.type==="f")void navigate({to:"/assistir/filme/$id",params:{id:spotlight.id}});
    else openItem(spotlight);
  };
  useEffect(()=>{
    if(searchOpen||section!=="all"||heroes.length<2)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=="visible" || document.activeElement?.closest(".zf-immersive-hero"))return;
      setHeroIndex(n=>(n+1)%heroes.length);
    },15000);
    return()=>window.clearInterval(timer);
  },[heroes,searchOpen,section]);
  useEffect(()=>{
    if(heroes.length<2 || typeof Image==="undefined")return;
    const next=heroes[(heroIndex+1)%heroes.length];
    if(!next?.backdropUrl)return;
    const image=new Image();
    image.decoding="async";
    image.src=next.backdropUrl; // one next banner, not a whole-image preload batch
  },[heroes,heroIndex]);
  const searchKeys=(event:KeyboardEvent<HTMLInputElement>)=>{
    const key=remoteKey(event.nativeEvent);
    if(key==="Enter"||key==="Select"){
      event.preventDefault();
      if(suggestions[0])openItem(suggestions[0]);
      else if(query.trim()&&status!=="loading")void navigate({to:"/busca",search:{q:query.trim()}});
    }
  };
  const spotlight=heroes[heroIndex]??hero??shelves[0]?.items[0]??null;

  return <main className="zf-tenfoot zf-tenfoot-home" ref={root} data-tv-exclusive="true" data-tv-build={TV_APP_BUILD}>
    {!searchOpen ? <>
      <aside className="zf-tv-sidemenu" aria-label="Navegação do ZANG FLIX TV">
        <span className="zf-tv-sidemenu-mark" aria-hidden="true">Z<span>F</span></span>
        <nav>
          {navOptions.map((option,index)=><div data-tv-row={"menu-"+index} key={option.key}>
            <button type="button" data-tv-focus={"nav-"+option.key}
              data-tv-start={option.key==="all"?"":undefined}
              data-tv-right-target="hero-play"
              aria-pressed={section===option.key} className={section===option.key?"is-selected":""}
              aria-label={option.title} onClick={()=>setSection(option.key)}>
              {option.key==="all"?<House size={22}/>:option.key==="f"?<Film size={22}/>:
                option.key==="s"?<Clapperboard size={22}/>:option.key==="a"?<Sparkles size={22}/>:<ListVideo size={22}/>}
              <span>{option.title}</span>
            </button>
          </div>)}
          <div data-tv-row="menu-live"><button type="button" data-tv-focus="nav-live"
              aria-label="TV ao vivo" data-tv-right-target="hero-play"
              onClick={()=>void navigate({to:"/tv-live"})}><Tv2 size={22}/><span>TV ao vivo</span></button></div>
          <div data-tv-row="menu-search"><button type="button" data-tv-focus="open-search"
              aria-label="Pesquisar" data-tv-right-target="hero-play" onClick={()=>setSearchOpen(true)}>
              <Search size={22}/><span>Buscar</span></button></div>
        </nav>
        <div className="zf-tv-sidemenu-hint" aria-hidden="true">Use ← para navegar</div>
      </aside>
      <section className="zf-immersive-hero" aria-label="Destaques de filmes">
        {spotlight?.backdropUrl&&!failedBackdrops.includes(spotlight.id)
          ? <img key={spotlight.id} className="zf-hero-backdrop" src={spotlight.backdropUrl}
              alt="" decoding="async" fetchPriority={heroIndex===0?"high":"auto"}
              onError={()=>setFailedBackdrops(current=>current.includes(spotlight.id)?current:[...current,spotlight.id])}/>
          : spotlight?.posterUrl
            ? <div className="zf-tv-poster-artwork" aria-hidden="true">
                <img src={spotlight.posterUrl} className="zf-tv-poster-artwork-blur" alt=""/>
                <img src={spotlight.posterUrl} className="zf-tv-poster-artwork-cover" alt=""/>
              </div>
            : <div className="zf-hero-fallback" aria-hidden="true"/>}
        <div className="zf-hero-shade" aria-hidden="true"/>
        <header className="zf-tv-headline"><span className="zf-tenfoot-logo">ZANG <b>FLIX</b></span><span>FILMES · SÉRIES · AO VIVO</span></header>
        <div className="zf-hero-copy">
          <span className="zf-hero-kicker"><span className="zf-hero-dot"/> EM DESTAQUE NO ZANG FLIX</span>
          <h1>{spotlight?.title||"O melhor da sua TV começa aqui."}</h1>
          {spotlight&&<div className="zf-hero-details">
            <span>{mediaLabel[spotlight.type]}</span>
            {spotlight.year&&<span>{spotlight.year}</span>}
            {spotlight.rating&&spotlight.rating>0&&<span>★ {spotlight.rating.toFixed(1)}</span>}
            {spotlight.backdropUrl&&<span>IMAGEM HD</span>}
          </div>}
          <p>{spotlight?.overview||"Descubra filmes, séries e animes selecionados para você. Navegue com o controle remoto."}</p>
          <div className="zf-hero-actions" data-tv-row="hero">
            <button type="button" data-tv-focus="hero-play" data-tv-left-target="nav-all" className="zf-hero-play"
              onClick={playHero} disabled={!spotlight}><Play size={20} fill="currentColor"/> Assistir agora</button>
            <button type="button" data-tv-focus="hero-details" className="zf-hero-details-button"
              onClick={()=>spotlight&&openItem(spotlight)} disabled={!spotlight}><Info size={21}/> Detalhes</button>
            <button type="button" data-tv-focus="hero-save" className="zf-hero-save"
              onClick={addSaved} disabled={!spotlight}
              aria-label={spotlight&&saved.includes(spotlight.id)?"Remover da minha lista":"Adicionar à minha lista"}>
              {spotlight&&saved.includes(spotlight.id)?<Check size={23}/>:<Heart size={23}/>}
            </button>
          </div>
          {heroes.length>1&&<div className="zf-tv-banner-switch" data-tv-row="banner-controls" aria-label="Alternar banners em destaque">
            <button type="button" data-tv-focus="banner-prev" aria-label="Banner anterior"
              onClick={()=>setHeroIndex(i=>(i-1+heroes.length)%heroes.length)}><ChevronLeft size={22}/></button>
            <span className="zf-tv-banner-progress">{String(heroIndex+1).padStart(2,"0")} <i/> {String(heroes.length).padStart(2,"0")}</span>
            <button type="button" data-tv-focus="banner-next" aria-label="Próximo banner"
              onClick={()=>setHeroIndex(i=>(i+1)%heroes.length)}><ChevronRight size={22}/></button>
          </div>}
        </div>
      </section>
      {serverOutdated&&<div className="zf-tv-update-warning" role="status">A versão publicada da TV está desatualizada. Os banners HD e os canais podem não funcionar até atualizar a hospedagem.</div>}
      {loading?<p className="zf-tenfoot-notice" role="status">Carregando sua experiência de TV…</p>:
        error?<p className="zf-tenfoot-notice" role="alert">Não foi possível carregar o catálogo. <button type="button" data-tv-focus="retry" data-tv-row="notice" onClick={()=>location.reload()}>Tentar novamente</button></p>:
        <div className="zf-immersive-shelves">
          {shelves.map((shelf,index)=><section className="zf-tenfoot-shelf" key={shelf.id} aria-label={shelf.title}>
            <div className="zf-shelf-heading"><h2>{shelf.title}</h2><span>{index===0?"SUA SELEÇÃO":""}</span></div>
            <div className="zf-shelf-track" data-tv-row={"shelf-"+shelf.id}>
              {shelf.items.map((item,position)=><button type="button" className="zf-poster-tile"
                 key={item.type+":"+item.id} data-tv-focus={"poster-"+shelf.id+"-"+item.id}
                 data-tv-left-target={position===0?"nav-all":undefined}
                 aria-label={"Abrir "+item.title} onClick={()=>openItem(item)}>
                 {item.posterUrl?<img src={item.posterUrl} alt="" loading="lazy" decoding="async" width={188} height={278}/>
                   :<span className="zf-poster-blank">{item.title.slice(0,2)}</span>}
                 <span className="zf-poster-title">{item.title}</span>
              </button>)}
            </div>
          </section>)}
          {!shelves.length&&<p className="zf-tenfoot-notice">Nenhum título encontrado nesta categoria.</p>}
        </div>}
    </>:<section className="zf-tenfoot-search" aria-label="Busca para TV">
      <header className="zf-search-heading"><div><span>BUSCA RÁPIDA</span><h1>O que vamos assistir?</h1></div>
        <button type="button" data-tv-focus="search-close" data-tv-row="search-top"
          onClick={()=>{setSearchOpen(false);setQuery("")}}><X size={23}/> Fechar</button>
      </header>
      <div className="zf-search-input-row" data-tv-row="search-input">
        <Search size={24}/>
        <input type="search" ref={searchInput} data-tv-focus="search-input" value={query}
           onChange={event=>setQuery(event.target.value)} onKeyDown={searchKeys}
           placeholder="Digite um filme, uma série ou um anime" aria-label="Pesquisar títulos" autoComplete="off" spellCheck={false}/>
      </div>
      <p className="zf-search-remote-hint">↓ Escolher sugestão · OK Abrir · Voltar Fechar</p>
      {query.trim()&&<>
        <h2 className="zf-search-subtitle">{status==="loading"?"Buscando títulos…":"Sugestões para você"}</h2>
        <div className="zf-search-results">
          {suggestions.map((item,index)=><div className="zf-search-result-row" data-tv-row={"search-"+Math.floor(index/4)} key={item.type+item.id}>
            <button className="zf-search-tile" data-tv-focus={"suggestion-"+item.type+"-"+item.id} type="button"
              onClick={()=>openItem(item)}>
              {item.posterUrl?<img src={item.posterUrl} alt="" loading="lazy" decoding="async"/>:<span>{item.title.slice(0,2)}</span>}
              <strong>{item.title}</strong><small>{mediaLabel[item.type]}</small>
              <ChevronRight size={15}/></button>
          </div>)}
          {status==="ready"&&!suggestions.length&&<p>Nenhum resultado. Experimente outra palavra.</p>}
          {status==="error"&&<p>A busca não respondeu. Tente novamente.</p>}
        </div>
      </>}
    </section>}
  </main>;
}
