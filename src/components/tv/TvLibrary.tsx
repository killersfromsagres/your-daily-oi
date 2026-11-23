"use client";
import {useEffect,useState} from "react";
import {ChevronRight,Film,Clapperboard,Loader2} from "lucide-react";
import {TvAnimeFrameIcon} from "@/components/icons/TvAnimeFrameIcon";
import type {TvLibraryResult,TvLibraryTile,TvLibraryType} from "@/lib/tv-library-catalog";

const TITLES:Record<TvLibraryType,string>={f:"Filmes",s:"Séries",a:"Animes"};
const LEADS:Record<TvLibraryType,string>={
  f:"Todos os filmes do acervo, organizados para você.",
  s:"Todas as séries do acervo, de todas as temporadas.",
  a:"Todo o catálogo de animes. Explore por gênero.",
};
const MAX_PAGES=10000;
interface Props{
  type:TvLibraryType;
  onOpen:(item:Pick<TvLibraryTile,"id"|"type">)=>void;
}
export function TvLibrary({type,onOpen}:Props){
  const [genre,setGenre]=useState("Todos");
  const [page,setPage]=useState(1);
  const [items,setItems]=useState<TvLibraryTile[]>([]);
  const [genres,setGenres]=useState<TvLibraryResult["genres"]>([]);
  const [total,setTotal]=useState(0);
  const [pageCount,setPageCount]=useState(1);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{setGenre("Todos");setPage(1);setItems([]);setGenres([]);setTotal(0);},[type]);
  useEffect(()=>{
    const controller=new AbortController();
    setBusy(true);setError("");
    const params=new URLSearchParams({tv:"library",type,genre,page:String(page)});
    void fetch("/api/catalogo?"+params.toString(),{signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw new Error("Catálogo indisponível: HTTP "+response.status);
        const body=await response.json() as TvLibraryResult;
        if(!Array.isArray(body.items)||!Array.isArray(body.genres)||
          body.type!==type)throw new Error("Catálogo incompatível");
        if(controller.signal.aborted)return;
        setGenres(body.genres);
        setTotal(body.total);
        setPageCount(body.pageCount);
        setItems(old=>page===1?body.items:[
          ...old,...body.items.filter(item=>!old.some(seen=>seen.type===item.type&&seen.id===item.id))
        ]);
      })
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Falha ao carregar títulos")})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    return()=>controller.abort();
  },[type,genre,page,retry]);
  const changeGenre=(value:string)=>{
    if(genre===value)return;
    setGenre(value);setPage(1);setItems([]);
  };
  return <section className="zf-tv-library" aria-label={"Catálogo completo de "+TITLES[type]}>
    <header className="zf-tv-library-head">
      <span className="zf-tenfoot-rail-caption">ZANG FLIX · CATÁLOGO COMPLETO</span>
      <h1>{type==="f"?<Film size={28}/>:type==="s"?<Clapperboard size={28}/>:<TvAnimeFrameIcon size={28}/>}
        {TITLES[type]}</h1>
      <p>{LEADS[type]}</p>
      <span className="zf-tv-library-count">{total.toLocaleString("pt-BR")} títulos nesta seleção</span>
    </header>
    <nav className="zf-tv-library-genres" data-tv-row="library-genres" aria-label={"Gêneros de "+TITLES[type]}>
      {["Todos",...genres.map(g=>g.name)].map((value,index)=>
        <button type="button" key={value} data-tv-focus={"library-genre-"+index}
          aria-pressed={genre===value} className={genre===value?"is-active":""}
          onClick={()=>changeGenre(value)}>
          {value}{index>0&&<small>{genres[index-1]?.count.toLocaleString("pt-BR")}</small>}
        </button>)}
    </nav>
    <div className="zf-tv-library-grid" aria-busy={busy&&page===1}>
      {items.map((item,index)=><button type="button" key={item.type+":"+item.id}
        className="zf-tv-library-card" data-tv-focus={"library-poster-"+item.type+"-"+item.id}
        data-tv-row={"library-row-"+Math.floor(index/6)}
        onClick={()=>onOpen(item)} aria-label={"Ver "+item.title}>
        {item.posterUrl
          ?<img src={item.posterUrl} loading="lazy" decoding="async" width={210} height={315} alt=""/>
          :<span className="zf-tv-library-poster-fallback">{item.title.slice(0,2)}</span>}
        <strong title={item.title}>{item.title}</strong>
        <small>{item.genres.slice(0,2).join(" · ")||TITLES[type]}</small>
      </button>)}
    </div>
    {busy&&<p className="zf-tv-library-message" role="status"><Loader2 size={18}/> Carregando títulos…</p>}
    {error&&<div className="zf-tv-library-message is-error" role="alert">
      {error} <button type="button" data-tv-focus="library-retry" data-tv-row="library-retry" onClick={()=>setRetry(r=>r+1)}>Tentar novamente</button>
    </div>}
    {!busy&&!error&&!items.length&&<p className="zf-tv-library-message">Nenhum título neste gênero.</p>}
    {!busy&&!error&&page<pageCount&&page<MAX_PAGES&&<button type="button"
      className="zf-tv-library-more" data-tv-focus="library-more" data-tv-row="library-more"
      onClick={()=>setPage(n=>n+1)}>
      Carregar mais títulos <ChevronRight size={20}/>
    </button>}
    <footer className="zf-tv-library-footer">{items.length.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} títulos</footer>
  </section>;
}
