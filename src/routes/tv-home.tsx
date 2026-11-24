import tvCinemaCss from "../styles/tv-cinema.css?url";
import tvReferenceCss from "../styles/tv-reference.css?url";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight, ChevronLeft, Clapperboard, Film, House, Info, ListVideo, Play, Search, Tv2, X, Plus, CircleHelp, Settings, Bell } from "lucide-react";
import { useLiveSuggestions } from "@/components/search/useLiveSuggestions";
import { TvAnimeFrameIcon } from "@/components/icons/TvAnimeFrameIcon";
import { TvLibrary } from "@/components/tv/TvLibrary";
import { getProgress, getSavedList, toggleSaved } from "@/lib/storage";
import { useTvFocus, tvReadFocus } from "@/lib/tv-focus";
import { remoteKey } from "@/lib/tv-remote";
import {TV_APP_BUILD} from "@/lib/tv-build";
import {tvHeroesFromResponse} from "@/lib/tv-hero-client";
import type { WatchProgress } from "@/lib/types";
import { tvHistory, tvPercent, tvTime, tvRememberSession } from "@/lib/tv-watch-history";
import { Clock } from "lucide-react";

type MediaType = "f" | "s" | "a";
interface TvItem { id:string; type:MediaType; title:string; posterUrl:string; backdropUrl?:string; overview?:string; year?:number|null; rating?:number|null }
interface TvRow { id:string; title:string; type:MediaType; items:TvItem[] }
interface TvPayload { rows:TvRow[]; heroes?:TvItem[]; hero?:TvItem|null }
type Section = "all" | MediaType | "saved" | "recent" | "settings" | "help";
const navOptions:ReadonlyArray<{key:Section;title:string}> = [
  {key:"all",title:"Início"},{key:"f",title:"Filmes"},{key:"s",title:"Séries"},{key:"a",title:"Animes"},{key:"saved",title:"Minha lista"},{key:"recent",title:"Histórico"}
];
const mediaLabel:Record<MediaType,string> = {f:"FILME",s:"SÉRIE",a:"ANIME"};

export const Route=createFileRoute("/tv-home")({
  component:TvHome,
  head:()=>({links:[{rel:"stylesheet",href:tvCinemaCss},{rel:"stylesheet",href:tvReferenceCss}],meta:[{title:"ZANG FLIX TV — Descubra seu próximo filme"}]})
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
  const [progress,setProgress]=useState<WatchProgress[]>([]);
  const [rotate,setRotate]=useState(true);
  useEffect(()=>{try{setRotate(localStorage.getItem("zf-tv-rotate")!=="off")}catch{}},[]);
  const toggleRotate=()=>{const next=!rotate;setRotate(next);try{localStorage.setItem("zf-tv-rotate",next?"on":"off")}catch{}};
  const {suggestions,status}=useLiveSuggestions(query,searchOpen);
  const onBack=useCallback(()=>{
    if(searchOpen){setSearchOpen(false);setQuery("");requestAnimationFrame(()=>document.querySelector<HTMLElement>('[data-tv-focus="open-search"]')?.focus());}
    else if(section!=="all")setSection("all");
    else if(window.history.length>1)window.history.back();
  },[searchOpen,section,navigate]);
  useTvFocus({route:"home",root,onBack});
  useEffect(()=>{if(searchOpen)return;const frame=requestAnimationFrame(()=>{const active=document.activeElement;if(!active||!root.current?.contains(active)){root.current?.querySelector<HTMLElement>('[data-tv-focus="nav-'+section+'"]')?.focus({preventScroll:true});}});return()=>cancelAnimationFrame(frame);},[section,searchOpen]);

  useEffect(()=>{
    tvRememberSession();
    const refresh=()=>{setSaved(getSavedList());setProgress(getProgress());};refresh();
    window.addEventListener("focus",refresh);
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
    return()=>{controller.abort();window.removeEventListener("focus",refresh);};
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
    if(!id.startsWith("poster-")&&!id.startsWith("history-"))return;
    const frame=requestAnimationFrame(()=>{
      const element=[...root.current?.querySelectorAll<HTMLElement>("[data-tv-focus]")||[]]
        .find(node=>node.dataset["tvFocus"]===id);
      if(element)element.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[loading,searchOpen]);

  const allItems=useMemo(()=>rows.flatMap(r=>r.items),[rows]);
  const uniqueSaved=useMemo(()=>allItems.filter((item,i)=>saved.includes(item.id)&&allItems.findIndex(other=>other.id===item.id)===i).slice(0,20),[allItems,saved]);
  const watching=useMemo(()=>tvHistory(progress),[progress]);
  const recent=useMemo(()=>tvHistory(progress,false),[progress]);
  const shelves=useMemo(()=>{
    const base=section==="all"?rows:section==="saved"||section==="recent"?[]:rows.filter(row=>row.type===section);
    const leading:TvRow[]=[];
    if((section==="saved"||section==="all")&&uniqueSaved.length)leading.push({id:"saved",title:"Minha lista",type:"f",items:uniqueSaved});
    return [...leading,...base];
  },[rows,section,uniqueSaved]);

  const openItem=useCallback((item:Pick<TvItem,"id"|"type">)=>{
    void navigate({to:"/tv-title",search:{id:item.id,type:item.type}});
  },[navigate]);
  const openProgress=(p:WatchProgress)=>{const id=p.contentId||p.id;if(p.type==="f")void navigate({to:"/assistir/filme/$id",params:{id}});else if(p.season!=null&&p.episode!=null&&tvPercent(p)<92){const params={id,temp:String(p.season),ep:String(p.episode)};if(p.type==="a")void navigate({to:"/assistir/anime/$id/$temp/$ep",params});else void navigate({to:"/assistir/serie/$id/$temp/$ep",params});}else openItem({id,type:p.type});};
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
    if(!rotate||searchOpen||section!=="all"||heroes.length<2)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=="visible" || document.activeElement?.closest(".zf-immersive-hero"))return;
      setHeroIndex(n=>(n+1)%heroes.length);
    },15000);
    return()=>window.clearInterval(timer);
  },[heroes,searchOpen,section,rotate]);
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
      
    }
  };
  const spotlight=heroes[heroIndex]??hero??shelves[0]?.items[0]??null;

  return <main className={"zf-tenfoot zf-tenfoot-home zf-tv-reference"+(searchOpen?" zf-ref-search-open":"")} ref={root} data-tv-exclusive="true" data-tv-build={TV_APP_BUILD}>
    {!searchOpen ? <>
      <aside className="zf-tv-sidemenu" aria-label="Navegação do Zang Flix TV">
        <button className="zf-tv-sidemenu-mark" type="button" data-tv-focus="brand-home" data-tv-down-target="nav-all" onClick={()=>setSection("all")} aria-label="Zang Flix — início"><img src="/brand/zang-word.webp?v=3" alt="Zang Flix" width={256} height={82}/></button>
        <nav aria-label="Menu principal">
          <span className="zf-tv-menu-label">Menu</span>
          {navOptions.slice(0,4).map((option,index)=><div data-tv-row={"menu-"+index} key={option.key}>
            <button type="button" data-tv-focus={"nav-"+option.key} data-tv-start={option.key==="all"?"":undefined}
              data-tv-right-target={section==="all"?"hero-play":section==="saved"?(uniqueSaved[0]?"poster-saved-"+uniqueSaved[0].id:undefined):section==="recent"?(recent[0]?"history-"+recent[0].id:undefined):section==="settings"?"settings-rotation":section==="help"?"help-back":"library-genre-0"}
              aria-pressed={section===option.key} className={section===option.key?"is-selected":""} onClick={()=>setSection(option.key)}>
              {option.key==="all"?<House size={22}/>:option.key==="f"?<Film size={22}/>:option.key==="s"?<Clapperboard size={22}/>:<TvAnimeFrameIcon size={22}/>}
              <span>{option.title}</span>
            </button>
          </div>)}
          <div data-tv-row="menu-live"><button type="button" data-tv-focus="nav-live" onClick={()=>void navigate({to:"/tv-live"})}><Tv2 size={22}/><span>TV ao vivo</span></button></div>
          <div className="zf-ref-menu-divider" aria-hidden="true"/>
          <span className="zf-tv-menu-label">Biblioteca</span>
          {navOptions.slice(4).map(option=><div data-tv-row={"menu-"+option.key} key={option.key}><button type="button" data-tv-focus={"nav-"+option.key} aria-pressed={section===option.key} className={section===option.key?"is-selected":""} data-tv-right-target={section==="saved"&&uniqueSaved[0]?"poster-saved-"+uniqueSaved[0].id:section==="recent"&&recent[0]?"history-"+recent[0].id:section==="all"?"hero-play":undefined} onClick={()=>setSection(option.key)}>{option.key==="saved"?<ListVideo size={22}/>:<Clock size={22}/>}<span>{option.title}</span></button></div>)}
          <div className="zf-ref-menu-divider" aria-hidden="true"/>
          <div data-tv-row="menu-settings"><button type="button" data-tv-focus="nav-settings" aria-pressed={section==="settings"} className={section==="settings"?"is-selected":""} data-tv-right-target="settings-rotation" onClick={()=>setSection("settings")}><Settings size={22}/><span>Configurações</span></button></div>
          <div data-tv-row="menu-help"><button type="button" data-tv-focus="nav-help" aria-pressed={section==="help"} className={section==="help"?"is-selected":""} data-tv-right-target="help-back" onClick={()=>setSection("help")}><CircleHelp size={22}/><span>Ajuda</span></button></div>
        </nav>
        <div className="zf-ref-menu-bottom" data-tv-row="menu-bottom"><button type="button" data-tv-focus="open-search" onClick={()=>setSearchOpen(true)}><Search size={20}/><span>Buscar</span></button></div>
      </aside>
      {section==="settings"||section==="help"?<section className="zf-ref-utility" aria-label={section==="settings"?"Configurações":"Ajuda"}>
        <h1>{section==="settings"?"Configurações":"Ajuda"}</h1>
        {section==="settings"?<><p>Personalize a experiência na televisão.</p><button className="zf-ref-option" data-tv-row="settings" data-tv-focus="settings-rotation" data-tv-left-target="nav-settings" aria-pressed={rotate} onClick={toggleRotate}>Rotação automática do banner <strong>{rotate?"Ativada":"Desativada"}</strong></button><p>Versão: {TV_APP_BUILD}{serverOutdated?" · Hospedagem desatualizada":""}</p></>:<><p>Use as setas do controle remoto para navegar, OK para selecionar e Voltar para retornar.</p><p>O progresso é salvo neste dispositivo. Em Continue assistindo, retome um título de onde parou.</p><button className="zf-ref-option" data-tv-focus="help-back" data-tv-row="help" data-tv-left-target="nav-help" onClick={()=>setSection("all")}>Voltar ao início</button></>}
      </section>:section!=="all"&&section!=="saved"&&section!=="recent"?<TvLibrary key={section} type={section} onOpen={openItem}/>:<>
      {section==="all"&&<>
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
        <header className="zf-tv-headline" data-tv-row="home-top">
          <button type="button" className="zf-ref-top-icon" data-tv-focus="top-back" data-tv-left-target="nav-all" aria-label="Voltar" onClick={onBack}><ChevronLeft size={26}/></button>
          <button type="button" className="zf-tv-top-search" data-tv-focus="top-search" data-tv-down-target="hero-play" onClick={()=>setSearchOpen(true)}><Search size={20}/> <span>Buscar</span></button>
          <nav className="zf-ref-top-nav" aria-label="Acesso rápido"><button type="button" data-tv-focus="top-films" onClick={()=>setSection("f")}>Filmes</button><button type="button" data-tv-focus="top-live" onClick={()=>void navigate({to:"/tv-live"})}>TV ao vivo</button><button type="button" data-tv-focus="top-series" onClick={()=>setSection("s")}>Séries</button></nav>
          <button type="button" className="zf-ref-top-icon zf-ref-status" data-tv-focus="top-status" onClick={()=>setSection("settings")} aria-label="Status e configurações"><Bell size={20}/>{serverOutdated&&<i/>}</button>
          <button type="button" className="zf-ref-profile" data-tv-focus="top-list" onClick={()=>setSection("saved")} aria-label="Minha lista"><img src="/brand/zang-mark.webp?v=2" alt="" width={32} height={32}/></button>
        </header>
        <div className="zf-hero-copy">
          <h1>{spotlight?.title||"Seu próximo filme começa aqui"}</h1>
          <p>{spotlight?.overview||"Descubra filmes, séries e animes selecionados para você. Navegue com o controle remoto."}</p>
          <div className="zf-hero-actions" data-tv-row="hero">
            <button type="button" data-tv-focus="hero-play" data-tv-left-target="nav-all" data-tv-up-target="top-search" className="zf-hero-play"
              onClick={playHero} disabled={!spotlight}><Play size={19} fill="currentColor"/> Assistir agora</button>
            <button type="button" data-tv-focus="hero-save" className="zf-hero-save" onClick={addSaved} disabled={!spotlight} aria-label={spotlight&&saved.includes(spotlight.id)?"Remover da minha lista":"Adicionar à minha lista"}>{spotlight&&saved.includes(spotlight.id)?<Check size={22}/>:<Plus size={22}/>}</button>
            <button type="button" data-tv-focus="hero-details" className="zf-hero-details-button" onClick={()=>spotlight&&openItem(spotlight)} disabled={!spotlight} aria-label="Detalhes"><Info size={24}/></button>
          </div>
        </div>
        {heroes.length>1&&<div className="zf-tv-banner-switch" data-tv-row="banner-controls" aria-label="Escolher destaque">
          {heroes.map((item,index)=><button key={item.id} type="button" data-tv-focus={"banner-"+index} aria-label={"Destaque "+(index+1)+": "+item.title} aria-pressed={heroIndex===index} className={heroIndex===index?"is-current":""} onClick={()=>setHeroIndex(index)}><span/></button>)}
        </div>}
      </section>
      </>}
      {serverOutdated&&<div className="zf-tv-update-warning" role="status">A versão publicada da TV está desatualizada. Os banners HD e os canais podem não funcionar até atualizar a hospedagem.</div>}
      {loading?<p className="zf-tenfoot-notice" role="status">Carregando sua experiência de TV…</p>:
        error?<p className="zf-tenfoot-notice" role="alert">Não foi possível carregar o catálogo. <button type="button" data-tv-focus="retry" data-tv-row="notice" onClick={()=>location.reload()}>Tentar novamente</button></p>:
        <div className={"zf-immersive-shelves"+(section!=="all"?" zf-tv-standalone-shelves":"")}>
          {((section==="all"&&watching.length>0)||section==="recent")&&<section className="zf-tenfoot-shelf" aria-label={section==="recent"?"Histórico":"Continue assistindo"}><div className="zf-shelf-heading"><h2>{section==="recent"?"Histórico":"Continue assistindo"}</h2></div><div className="zf-shelf-track" data-tv-row="history">{(section==="recent"?recent:watching).map((p,index)=>{const item=allItems.find(i=>i.id===(p.contentId||p.id)&&i.type===p.type);const artwork=item?.backdropUrl||p.posterUrl||item?.posterUrl;return <button type="button" className="zf-poster-tile zf-history-tile" key={p.id} data-tv-focus={"history-"+p.id} data-tv-left-target={index===0?"nav-"+(section==="recent"?"recent":"all"):undefined} aria-label={(item?.title||p.title)+" — "+(p.type!=="f"?"temporada "+p.season+", episódio "+p.episode+", ":"")+tvTime(p.currentTime)} onClick={()=>openProgress(p)}><span className="zf-tv-history-art">{artwork?<TvReferenceArtwork primary={artwork} fallback={p.posterUrl||item?.posterUrl||""} title={item?.title||p.title}/>:<span className="zf-poster-blank">{p.title.slice(0,2)}</span>}<span className="zf-ref-art-title">{item?.title||p.title}</span></span><span className="zf-tv-progress"><i style={{width:tvPercent(p)+"%"}}/></span><small className="zf-ref-history-detail">{p.type!=="f"?"T"+p.season+" · E"+p.episode+" · ":""}{tvPercent(p)>=92?"Concluído":tvTime(p.currentTime)}</small></button>;})}</div>{!(section==="recent"?recent:watching).length&&<p className="zf-tv-history-empty">Seus títulos aparecem aqui quando você começa a assistir.</p>}</section>}
          {shelves.map((shelf,index)=><section className="zf-tenfoot-shelf" key={shelf.id} aria-label={shelf.title}>
            <div className="zf-shelf-heading"><h2>{shelf.title}</h2><span>{index===0?"SUA SELEÇÃO":""}</span></div>
            <div className="zf-shelf-track" data-tv-row={"shelf-"+shelf.id}>
              {shelf.items.map((item,position)=><button type="button" className="zf-poster-tile"
                 key={item.type+":"+item.id} data-tv-focus={"poster-"+shelf.id+"-"+item.id}
                 data-tv-left-target={position===0?"nav-"+section:undefined}
                 aria-label={"Abrir "+item.title} onClick={()=>openItem(item)}>
                 <span className="zf-ref-card-art">{item.backdropUrl||item.posterUrl?<TvReferenceArtwork primary={item.backdropUrl||item.posterUrl} fallback={item.posterUrl} title={item.title}/>:<span className="zf-poster-blank">{item.title.slice(0,2)}</span>}<span className="zf-ref-art-title">{item.title}</span></span>
              </button>)}
            </div>
          </section>)}
          {!shelves.length&&section!=="recent"&&<p className="zf-tenfoot-notice">Nenhum título encontrado nesta categoria.</p>}
        </div>}
       </>}
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

function TvReferenceArtwork({primary,fallback,title}:{primary:string;fallback:string;title:string}){
  const [failed,setFailed]=useState<string[]>([]);
  const image=[primary,fallback].find(url=>url&&!failed.includes(url));
  return image?<img src={image} alt="" width={320} height={180} loading="lazy" decoding="async" onError={()=>setFailed(old=>old.includes(image)?old:[...old,image])}/>:<span className="zf-poster-blank" aria-hidden="true">{title.slice(0,2)}</span>;
}
