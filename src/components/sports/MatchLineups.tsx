"use client";
// src/components/sports/MatchLineups.tsx — separate team buttons + full-size lineup dialog.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, RefreshCw, Shirt, Users, X } from "lucide-react";
import type { JogoBrasileirao } from "@/lib/jogos-match";
import type { MatchLineups } from "@/lib/football-lineups";
import { selectLineupTeam, type TeamSide } from "@/lib/lineup-selection";
import { TeamLineupBoard } from "./TeamLineupBoard";
import "@/styles/sports-ticket-lineup.css";

const cache = new Map<string,{data:MatchLineups;time:number}>();
function currentCache(id:string) {
  const item=cache.get(id);
  if(!item)return null;
  const ttl=item.data.completa?30*60_000:item.data.disponivel?5*60_000:90_000;
  return Date.now()-item.time<ttl?item.data:null;
}
function LocalCrest({src,name}:{src?:string|null;name:string}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return <span className="zf-lineup-crest">
    {src&&!failed?<img src={src} alt={name} loading="lazy" onError={()=>setFailed(true)}/>:<Shirt size={20} aria-hidden="true"/>}
  </span>;
}
export function MatchLineups({game}:{game:JogoBrasileirao}) {
  const [side,setSide]=useState<TeamSide|null>(null);
  const [data,setData]=useState<MatchLineups|null>(()=>currentCache(game.id));
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [version,setVersion]=useState(0);
  const headingId=useId();
  const closeRef=useRef<HTMLButtonElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);
  const opened=side!==null;
  const homeTeam=selectLineupTeam(game,data,"home");
  const awayTeam=selectLineupTeam(game,data,"away");
  const selected=side?selectLineupTeam(game,data,side):null;
  const selectedName=side==="away"?game.fora:game.casa;
  const selectedCrest=side==="away"?game.escudoFora:game.escudoCasa;

  useEffect(()=>{
    // Do not leave old team photos visible when navigating to a new fixture.
    setData(currentCache(game.id));
    setError(null);
  },[game.id]);

  useEffect(()=>{
    if(!opened)return;
    const cached=currentCache(game.id);
    if(cached&&version===0){setData(cached);return;}
    const controller=new AbortController();
    setLoading(true);setError(null);
    fetch("/api/jogos-escalacao?jogo="+encodeURIComponent(game.id),{
      cache:"no-store",headers:{Accept:"application/json"},signal:controller.signal,
    }).then(async response=>{
      if(!response.ok)throw new Error("Escalação temporariamente indisponível ("+response.status+")");
      const payload=await response.json() as MatchLineups;
      if(!Array.isArray(payload.equipes))throw new Error("Escalação inválida");
      return payload;
    }).then(payload=>{
      if(controller.signal.aborted)return;
      cache.set(game.id,{data:payload,time:Date.now()});
      if(cache.size>120)cache.delete(cache.keys().next().value!);
      setData(payload);
    }).catch(err=>{
      if(controller.signal.aborted)return;
      setError(err instanceof Error?err.message:"Falha ao carregar escalação");
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[game.id,opened,version]);

  useEffect(()=>{
    if(!opened||data?.completa)return;
    const interval=window.setInterval(()=>{
      if(document.visibilityState==="visible")setVersion(v=>v+1);
    },3*60_000);
    return ()=>window.clearInterval(interval);
  },[opened,data?.completa]);

  useEffect(()=>{
    if(!opened)return;
    const previousOverflow=document.body.style.overflow;
    previousFocus.current=document.activeElement instanceof HTMLElement
      ?document.activeElement:null;
    document.body.style.overflow="hidden";
    closeRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setSide(null);}
      if(event.key==="Tab"){
        const modal=document.querySelector<HTMLElement>(".zf-lineup-dialog");
        const focusables=modal?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])'
        );
        if(!focusables?.length)return;
        const first=focusables[0],last=focusables[focusables.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",onKey);
    return ()=>{
      document.body.style.overflow=previousOverflow;
      document.removeEventListener("keydown",onKey);
      previousFocus.current?.focus();
    };
  },[opened]);

  const open=(next:TeamSide)=>{setSide(next);setError(null);};
  const photoCount=(team:typeof selected)=>team?.starting.length||0;
  const preview=(sideName:TeamSide)=>{
    const team=sideName==="home"?homeTeam:awayTeam;
    const name=sideName==="home"?game.casa:game.fora;
    const crest=sideName==="home"?game.escudoCasa:game.escudoFora;
    return <button key={sideName} type="button" className="zf-lineup-team-button"
      onClick={()=>open(sideName)} aria-label={"Ver escalação do "+name}>
      <LocalCrest name={name} src={crest}/>
      <span><small>{sideName==="home"?"ESCALAÇÃO · CASA":"ESCALAÇÃO · FORA"}</small>
        <strong title={name}>{name}</strong>
        <em>{team?.starting.length?team.starting.length+" titulares":"Ver formação"}</em>
      </span>
      <ChevronRight size={17} aria-hidden="true"/>
    </button>;
  };

  return <>
    <div className="zf-lineup-actions" aria-label="Escolher escalação de um time">
      {preview("home")}
      {preview("away")}
    </div>
    {opened&&typeof document!=="undefined"&&createPortal(
      <div className="zf-lineup-overlay" onPointerDown={event=>{
        if(event.target===event.currentTarget)setSide(null);
      }}>
        <section className="zf-lineup-dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <header className="zf-lineup-dialog-header">
            <div className="zf-lineup-dialog-brand">
              <span>ZANG <b>FLIX</b></span><small>FOOTBALL STUDIO / MATCH CENTER</small>
            </div>
            <button ref={closeRef} type="button" className="zf-lineup-close"
              aria-label="Fechar escalação" onClick={()=>setSide(null)}><X size={20}/></button>
          </header>
          <div className="zf-lineup-dialog-club" id={headingId}>
            <LocalCrest src={selectedCrest} name={selectedName}/>
            <div>
              <span>ESCALAÇÃO · {side==="home"?"MANDANTE":"VISITANTE"}</span>
              <h2>{selectedName}</h2>
              <p>{selected?.formation?"Formação "+selected.formation:"Formação não informada"} · {photoCount(selected)} titulares divulgados</p>
            </div>
            <button type="button" className="zf-lineup-refresh"
              onClick={()=>setVersion(v=>v+1)} disabled={loading} aria-label="Atualizar escalação">
              <RefreshCw size={17} className={loading?"is-spinning":""}/>
            </button>
          </div>
          <nav className="zf-lineup-switch" aria-label="Alternar entre escalações">
            <button type="button" className={side==="home"?"is-active":""}
              aria-pressed={side==="home"} onClick={()=>setSide("home")}>
              <ChevronLeft size={14}/>{game.casa}
            </button>
            <button type="button" className={side==="away"?"is-active":""}
              aria-pressed={side==="away"} onClick={()=>setSide("away")}>
              {game.fora}<ChevronRight size={14}/>
            </button>
          </nav>
          <div className="zf-lineup-dialog-body">
            {loading&&!data?<div className="zf-lineup-message" role="status">
              <RefreshCw className="is-spinning" size={24}/> Consultando titulares…
            </div>:
            error&&!data?<div className="zf-lineup-message" role="alert">{error}
              <button type="button" onClick={()=>setVersion(v=>v+1)}>Tentar novamente</button>
            </div>:
            !selected?.starting.length?<div className="zf-lineup-message" role="status">
              <Shirt size={30}/><strong>Escalação ainda não divulgada</strong>
              <p>{data?.mensagem||"Aguardando informações oficiais do provedor de futebol."}</p>
              {error&&<small>{error}</small>}
              <button type="button" onClick={()=>setVersion(v=>v+1)}>Atualizar escalação</button>
            </div>:
            <>
              {!data?.completa&&<p className="zf-lineup-partial">Escalação parcial · apenas jogadores publicados pela fonte</p>}
              <TeamLineupBoard team={selected}/>
              <p className="zf-lineup-source">Fonte: {data?.origem} · Posições organizadas por setor. O posicionamento exato depende dos dados táticos disponíveis.</p>
            </>}
          </div>
        </section>
      </div>,document.body)}
  </>;
}
