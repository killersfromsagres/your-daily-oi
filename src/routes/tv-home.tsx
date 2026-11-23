import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight, Heart, Play, Search, Tv2, X } from "lucide-react";
import { useLiveSuggestions } from "@/components/search/useLiveSuggestions";
import { getProgress, getSavedList, toggleSaved } from "@/lib/storage";
import { useTvFocus, tvReadFocus } from "@/lib/tv-focus";
import { remoteKey } from "@/lib/tv-remote";
import type { SearchSuggestion } from "@/lib/search-suggestions";

type MediaType = "f" | "s" | "a";
interface TvItem { id:string; type:MediaType; title:string; posterUrl:string; backdropUrl?:string; overview?:string; year?:number|null }
interface TvRow { id:string; title:string; type:MediaType; items:TvItem[] }
interface TvPayload { rows:TvRow[]; hero?:TvItem|null }
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
  const [section,setSection]=useState<Section>("all");
  const [rows,setRows]=useState<TvRow[]>([]);
  const [hero,setHero]=useState<TvItem|null>(null);
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
    else window.history.length>1 ? window.history.back():void navigate({to:"/tv-app"});
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
      })
      .catch(()=>{if(!controller.signal.aborted)setError(true)})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[]);
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
    if(!hero)return;
    toggleSaved(hero.id);setSaved(getSavedList());
  };
  const searchKeys=(event:KeyboardEvent<HTMLInputElement>)=>{
    const key=remoteKey(event.nativeEvent);
    if(key==="Enter"||key==="Select"){
      event.preventDefault();
      if(suggestions[0])openItem(suggestions[0]);
      else if(query.trim()&&status!=="loading")void navigate({to:"/busca",search:{q:query.trim()}});
    }
  };
  const spotlight=hero??shelves[0]?.items[0]??null;

  return <main className="zf-tenfoot zf-tenfoot-home" ref={root} data-tv-exclusive="true">
    {!searchOpen ? <>
      <section className="zf-immersive-hero" aria-label="Destaque">
        {spotlight?.backdropUrl||spotlight?.posterUrl
          ? <img className="zf-hero-backdrop" src={spotlight.backdropUrl||spotlight.posterUrl}
             alt="" decoding="async" fetchPriority="high"/>
          : <div className="zf-hero-fallback" aria-hidden/>}
        <div className="zf-hero-shade" aria-hidden/>
        <header className="zf-tenfoot-nav" data-tv-row="nav">
          <span className="zf-tenfoot-logo" aria-label="ZANG FLIX">ZANG <b>FLIX</b></span>
          {navOptions.map(option=><button type="button" key={option.key}
            data-tv-focus={"nav-"+option.key} data-tv-start={option.key==="all"?"":undefined}
            aria-pressed={section===option.key} className={section===option.key?"is-selected":""}
            onClick={()=>setSection(option.key)}>{option.title}</button>)}
          <button type="button" data-tv-focus="nav-live" onClick={()=>void navigate({to:"/tv-live"})}><Tv2 size={15}/> TV ao vivo</button>
          <button type="button" data-tv-focus="open-search" className="zf-tenfoot-magnify" aria-label="Pesquisar"
            onClick={()=>setSearchOpen(true)}><Search size={24}/></button>
        </header>
        <div className="zf-hero-copy">
          <span className="zf-hero-kicker">{spotlight?mediaLabel[spotlight.type]:"ZANG FLIX ORIGINAL"} <i/> SEU PRÓXIMO PLAY</span>
          <h1>{spotlight?.title||"Seu próximo filme começa aqui."}</h1>
          <p>{spotlight?.overview||"Filmes, séries e animes. Escolha com seu controle, assista na sua TV."}</p>
          <div className="zf-hero-actions" data-tv-row="hero">
            <button type="button" data-tv-focus="hero-play" className="zf-hero-play"
              onClick={()=>spotlight&&openItem(spotlight)} disabled={!spotlight}><Play size={20} fill="currentColor"/> Assistir</button>
            <button type="button" data-tv-focus="hero-save" className="zf-hero-save"
              onClick={addSaved} disabled={!spotlight} aria-label={spotlight&&saved.includes(spotlight.id)?"Remover da minha lista":"Adicionar à minha lista"}>
              {spotlight&&saved.includes(spotlight.id)?<Check size={23}/>:<Heart size={23}/>}
            </button>
          </div>
        </div>
      </section>
      {loading?<p className="zf-tenfoot-notice" role="status">Carregando sua experiência de TV…</p>:
        error?<p className="zf-tenfoot-notice" role="alert">Não foi possível carregar o catálogo. <button type="button" data-tv-focus="retry" data-tv-row="notice" onClick={()=>location.reload()}>Tentar novamente</button></p>:
        <div className="zf-immersive-shelves">
          {shelves.map((shelf,index)=><section className="zf-tenfoot-shelf" key={shelf.id} aria-label={shelf.title}>
            <div className="zf-shelf-heading"><h2>{shelf.title}</h2><span>{index===0?"SUA SELEÇÃO":""}</span></div>
            <div className="zf-shelf-track" data-tv-row={"shelf-"+shelf.id}>
              {shelf.items.map(item=><button type="button" className="zf-poster-tile"
                 key={item.type+":"+item.id} data-tv-focus={"poster-"+shelf.id+"-"+item.id}
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
