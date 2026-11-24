import tvCinemaCss from "../styles/tv-cinema.css?url";
import tvReferenceCss from "../styles/tv-reference.css?url";
import tvArenaCss from "../styles/tv-arena.css?url";
import type {GradeItemAgora} from "@/lib/epg";
import {TV_APP_BUILD} from "@/lib/tv-build";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Maximize2, Minimize2, Pause, Play, RefreshCw, Search, Tv2, Volume2, VolumeX, X } from "lucide-react";
import type { CanalTV } from "@/lib/canais";
import { fetchCanaisFallbackClient } from "@/lib/canais";

import { reuseUnchangedLiveChannels, retainLiveCatalogOnMetadataOutage } from "@/lib/tv-catalog-recovery";
import { useTvFocus } from "@/lib/tv-focus";
import { remoteKey } from "@/lib/tv-remote";
import {useTvGridColumns} from "@/lib/tv-grid";


const TvStreamPlayer=lazy(()=>import("@/components/player/TvStreamPlayer").then(module=>({default:module.TvStreamPlayer})));
const FAVORITES_KEY="zangflix:tv-favorites";
const LAST_KEY="zangflix:tv-last-channel";
const RECENTS_KEY="zangflix:tv-recents-v1";
type CatalogResponse={canais:CanalTV[];categorias:string[]};
function readList(key:string):string[]{
  try {
    const data:unknown=JSON.parse(localStorage.getItem(key)??"[]");
    return Array.isArray(data)?data.filter((id):id is string=>typeof id==="string").slice(0,120):[];
  } catch {return [];}
}
function saveList(key:string,ids:string[]){
  try {localStorage.setItem(key,JSON.stringify(ids))}catch{/* storage disabled */}
}
function normalize(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
const BASE_CATEGORIES=["Todos","Favoritos","Recentes"];
export const Route=createFileRoute("/tv-live")({
  component:TvLive,
  validateSearch:(search:Record<string,unknown>):{channel?:string;from?:"sports"}=>({...(typeof search["channel"]==="string"?{channel:search["channel"]}:{}),...(search["from"]==="sports"?{from:"sports" as const}:{})}),
  head:()=>({links:[{rel:"stylesheet",href:tvCinemaCss},{rel:"stylesheet",href:tvReferenceCss},{rel:"stylesheet",href:tvArenaCss}],meta:[{title:"ZANG FLIX TV — Canais ao vivo"}]})
});
function TvLive(){
  const navigate=useNavigate();
  const {channel:requestedChannel,from}=Route.useSearch();
  const openedRequest=useRef("");
  const [guide,setGuide]=useState<Record<string,GradeItemAgora>>({});
  useEffect(()=>{let disposed=false;let pending:AbortController|null=null;const refresh=async()=>{if(pending||document.visibilityState!=="visible")return;const c=new AbortController();pending=c;const timer=window.setTimeout(()=>c.abort(),12000);try{const r=await fetch("/api/epg/agora",{signal:c.signal,cache:"no-store"});if(!r.ok)throw Error("EPG");const list=await r.json() as GradeItemAgora[];if(!Array.isArray(list))return;const next:Record<string,GradeItemAgora>={};for(const e of list)if(e&&typeof e.canalNome==="string")next[normalize(e.canalNome)]=e;if(!disposed)setGuide(next);}catch{if(!disposed)setGuide({});}finally{window.clearTimeout(timer);if(pending===c)pending=null;}};void refresh();const timer=window.setInterval(refresh,60000);return()=>{disposed=true;pending?.abort();window.clearInterval(timer)}},[]);
  const returnHome=()=>void navigate({to:"/tv-home",search:from==="sports"?{section:"sports"}:{}});
  const root=useRef<HTMLElement>(null);
  const playerRef=useRef<HTMLDivElement>(null);
  const lastFocusedId=useRef("");
  const activeIdRef=useRef("");
  const playingIdRef=useRef("");
  const columns=useTvGridColumns("channels");
  const [channels,setChannels]=useState<CanalTV[]>([]);
  const [categories,setCategories]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [category,setCategory]=useState("Todos");
  const [search,setSearch]=useState("");
  const [favorites,setFavorites]=useState<string[]>([]);
  const [recents,setRecents]=useState<string[]>([]);
  const [limit,setLimit]=useState(48);
  const [activeId,setActiveId]=useState("");
  const [status,setStatus]=useState<"connecting"|"playing"|"unavailable">("connecting");
  const [muted,setMuted]=useState(false);
  const [paused,setPaused]=useState(false);
  const [cinemaControls,setCinemaControls]=useState(false);
  const [hudActivity,setHudActivity]=useState(0);
  // TV-only theater viewport. Never changes desktop or mobile player layouts.
  const [cinema,setCinema]=useState(false);

  const load=useCallback(async(force=false,signal?:AbortSignal)=>{
    if(force)setRefreshing(true);
    const requestController=new AbortController();
    const abort=()=>requestController.abort();
    const deadline=window.setTimeout(abort,12000);
    signal?.addEventListener("abort",abort,{once:true});
    try{
      const response=await fetch(force?"/api/canais?refresh=1":"/api/canais",
        {signal:requestController.signal,cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const data=await response.json() as CatalogResponse;
      if(!Array.isArray(data.canais))throw Error("Resposta inválida");
      if(signal?.aborted)return;
      // Keep verified playback alive when the CDN list is refreshed; React
      // must not remount the player for unchanged channel/source objects.
      setChannels(previous=>reuseUnchangedLiveChannels(previous,
        retainLiveCatalogOnMetadataOutage(previous,data.canais,{
          channelId:activeIdRef.current,
          playbackConfirmed:playingIdRef.current===activeIdRef.current && Boolean(activeIdRef.current),
        })));
      setCategories(Array.isArray(data.categorias)?data.categorias:[]);
      setError("");
    }catch(e){
      if(signal?.aborted)return;
      try {
        // An inaccessible origin should become an error, never an eternal spinner.
        let timer:number|undefined;
        let fallback:CatalogResponse;
        try {
          fallback=await Promise.race([
            fetchCanaisFallbackClient(),
            new Promise<never>((_,reject)=>{
              timer=window.setTimeout(()=>reject(new Error("Tempo limite do catálogo de canais")),10000);
            }),
          ]);
        } finally {if(timer!==undefined)window.clearTimeout(timer)}
        if(signal?.aborted)return;
        if(!fallback.canais.length)throw Error("Sem catálogo");
        setChannels(previous=>reuseUnchangedLiveChannels(previous,
          retainLiveCatalogOnMetadataOutage(previous,fallback.canais,{
            channelId:activeIdRef.current,
            playbackConfirmed:playingIdRef.current===activeIdRef.current && Boolean(activeIdRef.current),
          })));
        setCategories(fallback.categorias);
        setError("Serviço principal indisponível: mostrando lista de contingência.");
      }catch{
        if(!signal?.aborted)setError(e instanceof Error?e.message:"Não foi possível carregar a lista de canais");
      }
    }finally{
      window.clearTimeout(deadline);
      signal?.removeEventListener("abort",abort);
      if(!signal?.aborted){setLoading(false);setRefreshing(false)}
    }
  },[]);
  useEffect(()=>{
    setFavorites(readList(FAVORITES_KEY));
    setRecents(readList(RECENTS_KEY));
    const c=new AbortController();
    void load(false,c.signal);
    return()=>c.abort();
  },[load]);
  useEffect(()=>setLimit(48),[category,search]);
  // Stable callbacks are essential. Passing inline lambdas to LivePlayer
  // previously changed its effect dependencies on every parent status update,
  // causing a full decoder teardown and another "Conectando…" loop.
  const onPlaybackStatus=useCallback((id:string,next:"connecting"|"playing"|"unavailable")=>{
    if(activeIdRef.current!==id)return;
    if(next==="playing")playingIdRef.current=id;
    if(next==="unavailable")playingIdRef.current="";
    setStatus(next);
  },[]);

  const filtered=useMemo(()=>{
    const term=normalize(search.trim());
    let result=channels.filter(ch=>{
      if(category==="Favoritos"&&!favorites.includes(ch.id))return false;
      if(category==="Recentes"&&!recents.includes(ch.id))return false;
      if(!BASE_CATEGORIES.includes(category)&&ch.categoria!==category)return false;
      return !term||normalize(ch.nome+" "+ch.categoria+" "+(guide[normalize(ch.nome)]?.atual?.titulo||"")).includes(term);
    });
    if(category==="Recentes")return [...result].sort((a,b)=>recents.indexOf(a.id)-recents.indexOf(b.id));
    return [...result].sort((a,b)=>Number(b.fontes.length>0)-Number(a.fontes.length>0)||a.nome.localeCompare(b.nome,"pt-BR"));
  },[channels,category,search,favorites,recents,guide]);
  const active=useMemo(()=>channels.find(ch=>ch.id===activeId)||null,[channels,activeId]);
  const visible=filtered.slice(0,limit);
  const onBack=useCallback(()=>{
    if(cinema){
      setCinema(false);setCinemaControls(false);
      requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>('[data-tv-focus="player-fullscreen"]')?.focus({preventScroll:true}));
      return;
    }
    if(activeId){
      activeIdRef.current="";playingIdRef.current="";
      setActiveId("");
      if(from==="sports"){void navigate({to:"/tv-home",search:{section:"sports"}});return;}
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const target=[...document.querySelectorAll<HTMLElement>("[data-tv-channel]")].find(el=>el.dataset["tvChannel"]===lastFocusedId.current);
        target?.focus({preventScroll:true});
      }));
    }else if(search){setSearch("");}
    else void navigate({to:"/tv-home",search:from==="sports"?{section:"sports"}:{}});
  },[activeId,search,navigate,cinema,from]);
  useTvFocus({route:"live",root,onBack,playerOpen:cinema&&!cinemaControls});
  const choose=(ch:CanalTV)=>{
    if(!ch.fontes.length){setError("Este canal está sem fonte de transmissão. Atualize para tentar novamente.");return;}
    lastFocusedId.current=ch.id;
    activeIdRef.current=ch.id;
    playingIdRef.current="";
    setStatus("connecting");
    setCinema(false);setCinemaControls(false);setPaused(false);setMuted(false);
    setActiveId(ch.id);
    try{localStorage.setItem(LAST_KEY,ch.id)}catch{}
    setRecents(previous=>{
      const next=[ch.id,...previous.filter(x=>x!==ch.id)].slice(0,18);
      saveList(RECENTS_KEY,next);return next;
    });
  };
  useEffect(()=>{if(!requestedChannel||loading||refreshing||openedRequest.current===requestedChannel)return;openedRequest.current=requestedChannel;const ch=channels.find(c=>c.id===requestedChannel);if(ch&&ch.fontes.length){choose(ch);setError("");}else setError("O canal identificado para esta partida está indisponível no catálogo. Atualize ou retorne aos jogos.");},[requestedChannel,loading,refreshing,channels]);
  const toggleFavorite=(id:string)=>{
    setFavorites(prev=>{
      const next=prev.includes(id)?prev.filter(x=>x!==id):[id,...prev];
      saveList(FAVORITES_KEY,next);return next;
    });
  };
  const cycle=useCallback((offset:number)=>{
    const valid=channels.filter(c=>c.fontes.length>0);
    if(!valid.length)return;
    const index=valid.findIndex(c=>c.id===activeId);
    const next=valid[(index+offset+valid.length)%valid.length];
    if(next){
      if(cinema){setCinemaControls(true);setHudActivity(n=>n+1)}
      setPaused(false);setMuted(false);
      activeIdRef.current=next.id;
      playingIdRef.current="";
      lastFocusedId.current=next.id;
      setStatus("connecting");
      setActiveId(next.id);
      setRecents(previous=>{const updated=[next.id,...previous.filter(x=>x!==next.id)].slice(0,18);saveList(RECENTS_KEY,updated);return updated;});
    }
  },[channels,activeId,cinema]);
  const video=()=>playerRef.current?.querySelector("video")??null;
  const togglePlay=()=>{
    const el=video();if(!el)return;
    if(el.paused)void el.play().catch(()=>{});else el.pause();
  };
  const toggleMute=()=>{
    const el=video();if(!el)return;
    el.muted=!el.muted;setMuted(el.muted);
  };
  // Read actual media state. Never rely on an independent, drifting mute flag.
  useEffect(()=>{
    if(!activeId)return;
    const el=video();
    if(!el)return;
    const sync=()=>{setMuted(el.muted);setPaused(el.paused)};
    el.addEventListener("volumechange",sync);
    el.addEventListener("pause",sync);
    el.addEventListener("playing",sync);
    sync();
    return()=>{
      el.removeEventListener("volumechange",sync);
      el.removeEventListener("pause",sync);
      el.removeEventListener("playing",sync);
    };
  },[activeId,status]);
  // Fullscreen overlay disappears exactly 2s after it is exposed. It is
  // restored with any remote arrow/OK key, without remounting the decoder.
  useEffect(()=>{
    if(!cinema||!cinemaControls)return;
    const timer=window.setTimeout(()=>setCinemaControls(false),2000);
    return()=>window.clearTimeout(timer);
  },[cinema,cinemaControls,hudActivity]);
  useEffect(()=>{
    if(!cinema||cinemaControls)return;
    const frame=requestAnimationFrame(()=>video()?.focus({preventScroll:true}));
    return()=>cancelAnimationFrame(frame);
  },[cinema,cinemaControls]);
  useEffect(()=>{
    if(!cinema||cinemaControls)return;
    const reveal=(event:KeyboardEvent)=>{
      if(!["ArrowLeft","ArrowRight","ArrowDown","ArrowUp","Enter","Select","MediaPlayPause"].includes(event.key)&&
         ![37,38,39,40,13,23].includes(event.keyCode))return;
      event.preventDefault();event.stopPropagation();
      setCinemaControls(true);setHudActivity(n=>n+1);
      requestAnimationFrame(()=>requestAnimationFrame(()=>
        root.current?.querySelector<HTMLElement>('[data-tv-focus="cinema-play"]')?.focus({preventScroll:true})));
    };
    document.addEventListener("keydown",reveal,true);
    return()=>document.removeEventListener("keydown",reveal,true);
  },[cinema,cinemaControls]);
  useEffect(()=>{
    if(!activeId)return;
    const frame=requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>('[data-tv-focus="player-back"]')?.focus({preventScroll:true}));
    return()=>cancelAnimationFrame(frame);
  },[activeId]);
  const revealHud=()=>{setCinemaControls(true);setHudActivity(n=>n+1)};
  const enterCinema=()=>{revealHud();setCinema(true)};
  const exitCinema=()=>{setCinema(false);setCinemaControls(false)};
  useEffect(()=>{
    if(!activeId)return;
    const handler=(event:KeyboardEvent)=>{
      const key=remoteKey(event);
      if(!["MediaPlayPause","MediaPlay","MediaPause"].includes(key))return;
      const el=video();
      if(!el)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(key==="MediaPause"||key==="MediaPlayPause"&&!el.paused)el.pause();
      else void el.play().catch(()=>{});
      if(cinema){setCinemaControls(true);setHudActivity(n=>n+1)}
    };
    document.addEventListener("keydown",handler,true);
    return()=>document.removeEventListener("keydown",handler,true);
  },[activeId,cinema]);

  return <main className={"zf-tenfoot zf-tenfoot-live zf-tv-reference-inner"+(!active?" zf-tv-live-guide":"")+(cinema?" is-tv-cinema":"")} ref={root} data-tv-exclusive="true" data-tv-build={TV_APP_BUILD}>
    {!active ? <>
      <header className="zf-live-top" data-tv-row="live-nav">
        <button type="button" data-tv-focus="live-back" data-tv-start onClick={returnHome}><ArrowLeft size={20}/> {from==="sports"?"Voltar aos jogos":"Voltar"}</button>
        <div className="zf-tenfoot-logo"><img className="zf-brand-word" src="/brand/zang-word.webp?v=3" alt="Zang Flix" width={256} height={82}/> <span>AO VIVO</span></div>
        <button type="button" data-tv-focus="live-refresh" onClick={()=>{openedRequest.current="";void load(true)}} disabled={refreshing}><RefreshCw size={19}/> Atualizar</button>
      </header>
      <section className="zf-live-intro zf-live-feature">
        <div className="zf-live-feature-art" aria-hidden="true"><span/><span/><span/><span/></div><div className="zf-tenfoot-rail-caption"><span className="zf-live-dot"/> ZANG FLIX LIVE</div>
        <h1>TV ao vivo<span>.</span></h1>
        <p>Seus canais, sua programação. Escolha o que assistir agora.</p>
        <label className="zf-live-search" data-tv-row="live-search">
          <Search size={22}/><input data-tv-focus="live-input" type="search" value={search}
            onChange={e=>setSearch(e.target.value)} placeholder="Buscar canal ou programa" aria-label="Pesquisar canal ou programa" autoComplete="off"/>
          {search&&<button data-tv-focus="live-clear" type="button" aria-label="Limpar" onClick={()=>setSearch("")}><X size={18}/></button>}
        </label>
      </section>
      {recents.length>0&&channels.some(c=>c.id===recents[0]&&c.fontes.length>0)&&<div className="zf-live-resume" data-tv-row="live-resume"><button type="button" data-tv-focus="live-resume" onClick={()=>{const ch=channels.find(c=>c.id===recents[0]);if(ch)choose(ch)}}><Play size={20} fill="currentColor"/> <span><small>CONTINUE ASSISTINDO</small><strong>{channels.find(c=>c.id===recents[0])?.nome}</strong></span><ChevronRight size={21}/></button><button type="button" data-tv-focus="live-sports" onClick={()=>void navigate({to:"/tv-home",search:{section:"sports"}})}><Tv2 size={20}/> Jogos de hoje <ChevronRight size={20}/></button></div>}
      <nav className="zf-live-filters" data-tv-row="live-filters" aria-label="Categorias dos canais">
        {[...BASE_CATEGORIES,...categories.filter(c=>!BASE_CATEGORIES.includes(c))].map(cat=>
          <button type="button" data-tv-focus={"live-cat-"+cat} key={cat}
             aria-pressed={category===cat} className={category===cat?"is-active":""}
             onClick={()=>setCategory(cat)}>{cat}</button>)}
      </nav>
      {error&&<div className="zf-live-error" role="alert">{error}</div>}
      {loading?<p className="zf-tenfoot-notice" role="status">Carregando canais…</p>:
        <section className="zf-live-catalog" aria-label="Escolher canal">
          <div className="zf-live-catalog-head"><h2>{category==="Todos"?"Explore os canais":category}</h2><span>{filtered.length} opções</span></div>
          <div className="zf-live-grid">
            {visible.map((ch,i)=><button type="button" className={"zf-live-card"+(ch.fontes.length?"":" is-offline")}
              key={ch.id} data-tv-channel={ch.id} data-tv-focus={"channel-"+ch.id} data-tv-row={"channel-row-"+Math.floor(i/columns)}
              onClick={()=>choose(ch)} aria-label={"Selecionar "+ch.nome}>
              <span className="zf-live-card-image"><span className="zf-live-card-favorite" aria-hidden="true">{favorites.includes(ch.id)&&<Heart size={16} fill="currentColor"/>}</span>{ch.logo&&/^https:\/\//i.test(ch.logo)
                ?<img src={ch.logo} alt="" loading="lazy" decoding="async" onError={e=>e.currentTarget.style.display="none"}/>
                :<strong>{ch.nome.slice(0,3)}</strong>}</span>
              <span className="zf-live-card-copy"><strong>{ch.nome}</strong><small>{guide[normalize(ch.nome)]?.atual?.titulo||ch.categoria}</small></span>
              <span className={ch.fontes.length?"zf-live-status":"zf-live-status is-unavailable"}>{ch.fontes.length?<><Play size={12} fill="currentColor"/> Assistir</>:"Indisponível"}</span>
            </button>)}
          </div>
          {visible.length<filtered.length&&<button type="button" data-tv-row="live-more" data-tv-focus="load-more"
            className="zf-live-more" onClick={()=>setLimit(n=>n+40)}>Mostrar mais canais <ChevronRight size={18}/></button>}
          {!filtered.length&&<p className="zf-tenfoot-notice">Nenhum canal corresponde à sua busca.</p>}
        </section>}
    </>:<section className="zf-tv-player-screen" aria-label={"Assistindo "+active.nome}>
        <div className="zf-tv-player-toolbar" data-tv-row="player-toolbar">
          <button type="button" data-tv-focus="player-back" data-tv-start onClick={()=>onBack()}><ArrowLeft size={22}/> Voltar aos canais</button>
          <div className="zf-tv-player-title"><span className="zf-live-dot"/> <strong>{active.nome}</strong><small>{status==="playing"?(paused?"PAUSADO":"AO VIVO"):status==="connecting"?"Sintonizando…":"Transmissão indisponível"}</small></div>
          <button type="button" data-tv-focus="player-prev" onClick={()=>cycle(-1)} aria-label="Canal anterior"><ChevronLeft size={22}/></button>
          <button type="button" data-tv-focus="player-next" onClick={()=>cycle(1)} aria-label="Próximo canal"><ChevronRight size={22}/></button>
          <button type="button" data-tv-focus="player-favorite" aria-label="Favoritar canal" onClick={()=>toggleFavorite(active.id)}>
            <Heart size={20} fill={favorites.includes(active.id)?"currentColor":"none"}/></button>
        </div>
        <div ref={playerRef} className={"zf-tv-player-frame"+(cinema?" is-tv-fullscreen":"")} aria-label={cinema?"Vídeo em tela cheia":"Janela de vídeo"}>
          <Suspense fallback={<p className="zf-tenfoot-notice" role="status">Preparando transmissão…</p>}>
            <TvStreamPlayer key={active.id} canal={active}
              onPlaybackStatus={onPlaybackStatus}/>
          </Suspense>
          {cinema&&<div className={"zf-tv-cinema-overlay"+(cinemaControls?"":" is-hidden")}
            aria-hidden={!cinemaControls}>
            <div className="zf-tv-cinema-top">
              <span><span className="zf-live-dot"/> {active.nome} · {status==="playing"?"AO VIVO":"SINTONIZANDO"}</span>
              <button type="button" className="zf-tv-fullscreen-exit"
                data-tv-focus="player-fullscreen-exit" data-tv-start
                onClick={exitCinema} aria-label="Sair da tela cheia"><Minimize2 size={19}/> Sair da tela cheia</button>
            </div>
            <div className="zf-tv-cinema-actions" data-tv-row="cinema-actions">
              <button type="button" data-tv-focus="cinema-prev" onClick={()=>{cycle(-1);revealHud()}} aria-label="Canal anterior"><ChevronLeft size={23}/> Anterior</button>
              <button type="button" data-tv-focus="cinema-play" onClick={()=>{togglePlay();revealHud()}}
                aria-label={paused?"Reproduzir":"Pausar"}>{paused?<Play size={22}/>:<Pause size={22}/>} {paused?"Reproduzir":"Pausar"}</button>
              <button type="button" data-tv-focus="cinema-mute" onClick={()=>{toggleMute();revealHud()}}
                aria-label={muted?"Ativar som":"Silenciar"}>{muted?<VolumeX size={22}/>:<Volume2 size={22}/>} {muted?"Ativar som":"Silenciar"}</button>
              <button type="button" data-tv-focus="cinema-next" onClick={()=>{cycle(1);revealHud()}} aria-label="Próximo canal">Próximo <ChevronRight size={23}/></button>
            </div>
            <small>Os controles desaparecem automaticamente · Setas do controle para mostrar</small>
          </div>}
        </div>
        <footer className="zf-tv-player-bottom" data-tv-row="player-actions">
          <button type="button" data-tv-focus="player-play" onClick={togglePlay}
            aria-label={paused?"Reproduzir":"Pausar"}>
            {paused?<Play size={20}/>:<Pause size={20}/>} {paused?"Reproduzir":"Pausar"}</button>
          <button type="button" data-tv-focus="player-mute" onClick={toggleMute}
            aria-label={muted?"Ativar som":"Silenciar"}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>} {muted?"Ativar som":"Silenciar"}</button>
          <button type="button" className="zf-tv-fullscreen-action" data-tv-focus="player-fullscreen"
            onClick={enterCinema} aria-label="Ampliar transmissão para tela cheia">
            <Maximize2 size={21}/> Tela cheia
          </button>
          <span>Use o botão Voltar do controle para escolher outro canal</span>
        </footer>
      </section>}
  </main>;
}
