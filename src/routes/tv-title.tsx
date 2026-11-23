import tvCinemaCss from "../styles/tv-cinema.css?url";
import {TV_APP_BUILD} from "@/lib/tv-build";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Heart, Play, Tv2 } from "lucide-react";
import { useTvFocus } from "@/lib/tv-focus";
import { getSavedList, toggleSaved } from "@/lib/storage";
import type { CatalogItem } from "@/lib/types";

type MediaType = "f" | "s" | "a";
export const Route=createFileRoute("/tv-title")({
  validateSearch:(search:Record<string,unknown>)=>({
    id:typeof search["id"]==="string"?search["id"]:"",
    type:search["type"]==="s"||search["type"]==="a"?"s"===search["type"]?"s" as const:"a" as const:"f" as const,
  }),
  component:TvTitle,
  head:()=>({links:[{rel:"stylesheet",href:tvCinemaCss}],meta:[{title:"ZANG FLIX TV — Detalhes"}]})
});
function TvTitle(){
  const {id,type}=Route.useSearch();
  const navigate=useNavigate();
  const root=useRef<HTMLElement>(null);
  const [item,setItem]=useState<CatalogItem|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const [selectedSeason,setSelectedSeason]=useState(1);
  const back=useCallback(()=>void navigate({to:"/tv-home"}),[navigate]);
  useTvFocus({route:"title-"+id,root,onBack:back});
  useEffect(()=>{
    if(!id){setError("Título não informado");setLoading(false);return;}
    const controller=new AbortController();setLoading(true);setError("");
    fetch("/api/item?id="+encodeURIComponent(id)+"&tipo="+(type==="f"?"filme":type==="a"?"anime":"series"),
      {signal:controller.signal,cache:"no-store"})
      .then(async r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json() as Promise<CatalogItem>})
      .then(data=>{
        if(controller.signal.aborted)return;
        setItem(data);setSaved(getSavedList().includes(data.id));
        setSelectedSeason(data.seasons?.[0]?.seasonNumber||1);
      })
      .catch(()=>{if(!controller.signal.aborted)setError("Não foi possível carregar o título. Tente novamente.")})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[id,type]);
  const season=useMemo(()=>item?.seasons?.find(s=>s.seasonNumber===selectedSeason),[item,selectedSeason]);
  const play=()=>{
    if(!item)return;
    if(item.type==="f")void navigate({to:"/assistir/filme/$id",params:{id:item.id}});
    else{
      const first=season?.episodes[0]||item.seasons?.[0]?.episodes[0];
      if(!first)return;
      const params={id:item.id,temp:String(first.seasonNumber),ep:String(first.episodeNumber)};
      if(item.type==="a")void navigate({to:"/assistir/anime/$id/$temp/$ep",params});
      else void navigate({to:"/assistir/serie/$id/$temp/$ep",params});
    }
  };
  return <main className="zf-tenfoot zf-tenfoot-detail" data-tv-exclusive="true" data-tv-build={TV_APP_BUILD} ref={root}>
    <header className="zf-detail-head" data-tv-row="detail-nav">
      <button type="button" data-tv-focus="detail-back" data-tv-start onClick={back}><ArrowLeft size={23}/> Voltar</button>
      <div className="zf-tenfoot-logo">ZANG <b>FLIX</b></div>
      <button type="button" data-tv-focus="detail-live" onClick={()=>void navigate({to:"/tv-live"})}><Tv2 size={20}/> TV ao vivo</button>
    </header>
    {loading?<p className="zf-tenfoot-notice" role="status">Carregando detalhes…</p>:
      error||!item?<p className="zf-tenfoot-notice" role="alert">{error||"Título não encontrado"}</p>:
      <>
        <section className="zf-detail-hero">
          {item.tmdb?.backdropUrl||item.posterUrl?
            <img src={item.tmdb?.backdropUrl||item.posterUrl} alt="" className="zf-detail-backdrop" decoding="async"/>:null}
          <div className="zf-detail-dim"/>
          <div className="zf-detail-copy">
            <span className="zf-tenfoot-rail-caption">{item.type==="f"?"FILME":item.type==="a"?"ANIME":"SÉRIE"} · ZANG FLIX TV</span>
            <h1>{item.tmdb?.title||item.title}</h1>
            <p>{item.tmdb?.overview||"Selecione Assistir para começar."}</p>
            <div className="zf-detail-actions" data-tv-row="detail-actions">
              <button className="zf-hero-play" type="button" data-tv-focus="detail-play" onClick={play}>
                <Play size={20} fill="currentColor"/> Assistir
              </button>
              <button className="zf-hero-save" type="button" data-tv-focus="detail-save"
                onClick={()=>{toggleSaved(item.id);setSaved(getSavedList().includes(item.id))}}
                aria-label={saved?"Remover da minha lista":"Adicionar à minha lista"}>
                {saved?<Check size={22}/>:<Heart size={22}/>}
              </button>
            </div>
          </div>
        </section>
        {item.type!=="f"&&item.seasons?.length?<section className="zf-detail-episodes">
          <h2>Escolha um episódio</h2>
          <div className="zf-detail-seasons" data-tv-row="detail-seasons">
            {item.seasons.map(s=><button type="button" data-tv-focus={"season-"+s.seasonNumber} key={s.seasonNumber}
              className={selectedSeason===s.seasonNumber?"is-active":""}
              aria-pressed={selectedSeason===s.seasonNumber} onClick={()=>setSelectedSeason(s.seasonNumber)}>
              Temporada {s.seasonNumber}</button>)}
          </div>
          <div className="zf-detail-episode-grid">{season?.episodes.slice(0,50).map((ep,index)=>
            <button type="button" data-tv-focus={"ep-"+ep.episodeNumber} data-tv-row={"episodes-"+Math.floor(index/4)}
              key={ep.episodeNumber} className="zf-detail-episode"
              onClick={()=>{
                const params={id:item.id,temp:String(ep.seasonNumber),ep:String(ep.episodeNumber)};
                if(item.type==="a")void navigate({to:"/assistir/anime/$id/$temp/$ep",params});
                else void navigate({to:"/assistir/serie/$id/$temp/$ep",params});
              }}>
              {ep.thumbUrl?<img src={ep.thumbUrl} alt="" loading="lazy" decoding="async"/>:<span className="zf-detail-episode-placeholder"><Play size={32}/></span>}
              <strong>{ep.episodeNumber}. {ep.title||ep.name||"Episódio "+ep.episodeNumber}</strong>
            </button>)}</div>
        </section>:null}
      </>}
  </main>;
}
