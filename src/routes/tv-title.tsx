import tvCinemaCss from "../styles/tv-cinema.css?url";
import tvReferenceCss from "../styles/tv-reference.css?url";
import {TV_APP_BUILD} from "@/lib/tv-build";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Heart, Play, Tv2 } from "lucide-react";
import { useTvFocus } from "@/lib/tv-focus";
import { tvEpisodeRecords, tvNextEpisode, tvRememberSession, tvTime } from "@/lib/tv-watch-history";
import { EPISODE_PROGRESS_CHANGED, getEpisodePercentage, getEpisodeStatus, type EpisodeRecord } from "@/lib/episode-progress";
import { useTvGridColumns } from "@/lib/tv-grid";
import { getProgressById, getSavedList, toggleSaved } from "@/lib/storage";
import type { CatalogItem, EpisodeItem } from "@/lib/types";
import { VerifiedQualityBadge } from "@/components/catalog/VerifiedQualityBadge";

type MediaType = "f" | "s" | "a";
export const Route=createFileRoute("/tv-title")({
  validateSearch:(search:Record<string,unknown>)=>({
    id:typeof search["id"]==="string"?search["id"]:"",
    type:search["type"]==="s"||search["type"]==="a"?"s"===search["type"]?"s" as const:"a" as const:"f" as const,
  }),
  component:TvTitle,
  head:()=>({links:[{rel:"stylesheet",href:tvCinemaCss},{rel:"stylesheet",href:tvReferenceCss}],meta:[{title:"ZANG FLIX TV — Detalhes"}]})
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
  const [revision,setRevision]=useState(0);
  const [meta,setMeta]=useState<Array<{numero:number;nome?:string;still?:string|null;sinopse?:string}>>([]);
  const [failed,setFailed]=useState<string[]>([]);
  const columns=useTvGridColumns("episodes");
  useEffect(()=>{tvRememberSession();const refresh=()=>setRevision(n=>n+1);window.addEventListener("focus",refresh);window.addEventListener("storage",refresh);window.addEventListener(EPISODE_PROGRESS_CHANGED,refresh);return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("storage",refresh);window.removeEventListener(EPISODE_PROGRESS_CHANGED,refresh);};},[]);
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
        setSelectedSeason(tvNextEpisode(data,tvEpisodeRecords(data))?.seasonNumber??data.seasons?.[0]?.seasonNumber??1);
      })
      .catch(()=>{if(!controller.signal.aborted)setError("Não foi possível carregar o título. Tente novamente.")})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[id,type]);
  const season=useMemo(()=>item?.seasons?.find(s=>s.seasonNumber===selectedSeason),[item,selectedSeason]);
  const records=useMemo(()=>item?tvEpisodeRecords(item):new Map<string,EpisodeRecord>(),[item,revision]);
  const next=useMemo(()=>item?tvNextEpisode(item,records):undefined,[item,records]);
  const nextRecord=next?records.get(next.seasonNumber+":"+next.episodeNumber)||null:null;
  const movieRecord=item?.type==="f"?getProgressById(item.id):undefined;
  useEffect(()=>{
    setMeta([]);setFailed([]);if(!item||item.type==="f"||(!item.tmdbId&&item.type==="a"))return;
    const controller=new AbortController();
    void fetch("/api/episodios?serie="+encodeURIComponent(String(item.tmdbId||item.id))+"&temporada="+selectedSeason,{signal:controller.signal})
      .then(r=>r.ok?r.json():[]).then(data=>{if(!controller.signal.aborted&&Array.isArray(data))setMeta(data);}).catch(()=>{});
    return()=>controller.abort();
  },[item?.id,item?.tmdbId,item?.type,selectedSeason]);
  const openEpisode=(ep:EpisodeItem)=>{if(!item)return;const params={id:item.id,temp:String(ep.seasonNumber),ep:String(ep.episodeNumber)};if(item.type==="a")void navigate({to:"/assistir/anime/$id/$temp/$ep",params});else void navigate({to:"/assistir/serie/$id/$temp/$ep",params});};
  const play=()=>{
    if(!item)return;
    if(item.type==="f")void navigate({to:"/assistir/filme/$id",params:{id:item.id}});
    else{
      if(next)openEpisode(next);
    }
  };
  return <main className="zf-tenfoot zf-tenfoot-detail zf-tv-reference-inner" data-tv-exclusive="true" data-tv-build={TV_APP_BUILD} ref={root}>
    <header className="zf-detail-head" data-tv-row="detail-nav">
      <button type="button" data-tv-focus="detail-back" data-tv-start onClick={back}><ArrowLeft size={23}/> Voltar</button>
      <div className="zf-tenfoot-logo"><img className="zf-brand-word" src="/brand/zang-word.webp?v=3" alt="Zang Flix" width={256} height={82}/></div>
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
            <div style={{margin:"15px 0 16px"}}><VerifiedQualityBadge
              media={{type:item.type,id:item.id}} streams={item.streams}/></div>
            <div className="zf-detail-actions" data-tv-row="detail-actions">
              <button className="zf-hero-play" type="button" data-tv-focus="detail-play" disabled={item.type!=="f"&&!next} onClick={play}>
                <Play size={20} fill="currentColor"/> {getEpisodeStatus(nextRecord)==="started"||(movieRecord&&movieRecord.currentTime>4&&(!movieRecord.duration||movieRecord.currentTime/movieRecord.duration<.92))?"Continuar assistindo":next?"Assistir T"+next.seasonNumber+" · E"+next.episodeNumber:"Assistir"}
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
          <h2>Episódios</h2>
          <p className="zf-tv-episode-summary">{[...records.values()].filter(r=>r.completed).length} assistidos de {(item.seasons||[]).reduce((n,s)=>n+s.episodes.length,0)}{nextRecord&&!nextRecord.completed&&nextRecord.currentTime>=4?" · Você parou em T"+next?.seasonNumber+" E"+next?.episodeNumber+" — "+tvTime(nextRecord.currentTime):""}</p>
          <div className="zf-detail-seasons" data-tv-row="detail-seasons">
            {item.seasons.map(s=><button type="button" data-tv-focus={"season-"+s.seasonNumber} key={s.seasonNumber}
              className={selectedSeason===s.seasonNumber?"is-active":""}
              aria-pressed={selectedSeason===s.seasonNumber} onClick={()=>setSelectedSeason(s.seasonNumber)}>
              Temporada {s.seasonNumber}</button>)}
          </div>
          <div className="zf-detail-episode-grid">{season?.episodes.map((ep,index)=>{const key=ep.seasonNumber+":"+ep.episodeNumber;const rec=records.get(key)||null;const status=getEpisodeStatus(rec);const percent=getEpisodePercentage(rec);const info=meta.find(m=>Number(m.numero)===ep.episodeNumber);const candidates=[ep.thumbUrl,info?.still].filter((url):url is string=>typeof url==="string"&&url.length>0);const still=candidates.find(url=>!failed.includes(key+":"+url))||"";const fallback=item.tmdb?.backdropUrl||item.posterUrl||"";const art=still||(fallback&&!failed.includes(key+":"+fallback)?fallback:"");return (
            <button type="button" data-tv-focus={"ep-"+ep.seasonNumber+"-"+ep.episodeNumber} data-tv-row={"episodes-"+Math.floor(index/columns)}
              key={ep.episodeNumber} className="zf-detail-episode"
              onClick={()=>openEpisode(ep)}>
              <div className="zf-tv-episode-art">{art?<img src={art} alt="" loading="lazy" decoding="async" onError={()=>setFailed(old=>[...old,key+":"+art])}/>:<span className="zf-detail-episode-placeholder"><Play size={32}/><small>Imagem indisponível</small></span>}{status==="watched"?<span className="zf-tv-episode-tag"><Check size={15}/> Assistido</span>:status==="started"?<span className="zf-tv-episode-tag">Em andamento</span>:null}{percent!==null&&percent>0&&<span className="zf-tv-progress"><i style={{width:percent+"%"}}/></span>}</div>
              <strong>{ep.episodeNumber}. {info?.nome||ep.title||ep.name||"Episódio "+ep.episodeNumber}</strong>
              <small className="zf-tv-episode-state">{status==="watched"?"Concluído":status==="started"?"Parou em "+tvTime(rec?.currentTime||0):"Não assistido"}{art&&art!==still?" · Imagem da série":""}</small>
              <VerifiedQualityBadge media={{type:item.type,id:item.id,season:ep.seasonNumber,episode:ep.episodeNumber}}
                streams={ep.streams}/>
            </button>);})}</div>
        </section>:null}
      </>}
  </main>;
}
