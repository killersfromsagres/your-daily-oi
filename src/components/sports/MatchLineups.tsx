"use client";
// src/components/sports/MatchLineups.tsx — live lineup panel and 50/50 football pitch.
import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, CircleHelp, RefreshCw, Shirt, UsersRound } from "lucide-react";
import type { JogoBrasileirao } from "@/lib/jogos-match";
import type { LineupPlayer, LineupTeam, MatchLineups, PlayerPosition } from "@/lib/football-lineups";
import "@/styles/match-lineups.css";

const cache = new Map<string,{data:MatchLineups;time:number}>();
const LINES: {key:PlayerPosition;name:string}[] = [
  {key:"GOL",name:"Goleiro"},{key:"DEF",name:"Defesa"},
  {key:"MEI",name:"Meio-campo"},{key:"ATA",name:"Ataque"},
];
function PlayerAvatar({player}:{player:LineupPlayer}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[player.photo]);
  return <span className="zlineup-avatar">
    <span className="zlineup-avatar-initial" aria-hidden="true">{player.name.charAt(0)}</span>
    {player.photo && !failed && <img
      src={player.photo} alt={player.name} loading="lazy" decoding="async"
      onError={()=>setFailed(true)}/>}
  </span>;
}
function PlayerDot({player}:{player:LineupPlayer}){
  return <div className="zlineup-player" title={player.name+" · "+player.position}>
    <PlayerAvatar player={player}/>
    <span className="zlineup-player-label">{player.number && <b>{player.number}</b>}{player.name}</span>
    <small>{player.position}</small>
  </div>;
}
function TeamHalf({team,side,backupName,crest}:{team?:LineupTeam;side:"home"|"away";backupName:string;crest?:string}){
  const lines=useMemo(()=>LINES.map(entry=>({
    ...entry,players:(team?.starting||[]).filter(p=>p.group===entry.key),
  })),[team]);
  return <div className={"zlineup-half zlineup-half--"+side}>
    <div className="zlineup-side-title">
      {crest && <img src={crest} alt="" loading="lazy"/>}
      <strong>{team?.name||backupName}</strong>
      <span>{team?.formation||"Formação não divulgada"}</span>
    </div>
    <div className="zlineup-lanes" aria-label={"Titulares de "+(team?.name||backupName)}>
      {lines.map(line=><div key={line.key} className={"zlineup-lane zlineup-lane-"+line.key}
        aria-label={line.name}>
        {line.players.map(player=><PlayerDot key={player.id} player={player}/>)}
      </div>)}
    </div>
  </div>;
}
function Coach({team,backupName}:{team?:LineupTeam;backupName:string}){
  const [failed,setFailed]=useState(false);
  const photo=team?.coach?.photo;
  useEffect(()=>setFailed(false),[photo]);
  return <div className="zlineup-coach">
    <span className="zlineup-coach-avatar">
      {photo&&!failed?<img src={photo} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<Shirt size={19}/>}
    </span>
    <span><small>TÉCNICO · {team?.name||backupName}</small>
      <strong>{team?.coach?.name||"Ainda não informado"}</strong>
    </span>
  </div>;
}
function isNearMatch(game:JogoBrasileirao):boolean{
  const at=Date.parse(game.inicioIso),now=Date.now();
  return Number.isFinite(at)&&now>=at-90*60_000&&now<=at+5*60*60_000;
}
export function MatchLineups({game}:{game:JogoBrasileirao}){
  const id=useId();
  const [expanded,setExpanded]=useState(false);
  const [data,setData]=useState<MatchLineups|null>(()=>cache.get(game.id)?.data||null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [refresh,setRefresh]=useState(0);
  const near=isNearMatch(game);

  // Preload only shortly before kickoff so the card can show real starters
  // without forcing many requests on a week's worth of future fixtures.
  useEffect(()=>{
    if(!expanded && !near)return;
    const cached=cache.get(game.id);
    const ttl=cached?.data.completa?30*60_000:cached?.data.disponivel?5*60_000:90_000;
    if(cached && refresh===0 && Date.now()-cached.time<ttl){
      setData(cached.data);return;
    }
    let cancelled=false;
    const controller=new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/jogos-escalacao?jogo="+encodeURIComponent(game.id),{
      signal:controller.signal,headers:{Accept:"application/json"},cache:"no-store",
    }).then(async response=>{
      if(!response.ok)throw new Error("A fonte de escalações não respondeu ("+response.status+")");
      const result=await response.json() as MatchLineups;
      if(!Array.isArray(result.equipes))throw new Error("Dados de escalação inválidos");
      return result;
    }).then(value=>{
      if(cancelled)return;
      cache.set(game.id,{data:value,time:Date.now()});
      if(cache.size>100)cache.delete(cache.keys().next().value!);
      setData(value);
    }).catch(e=>{
      if(cancelled)return;
      setError(e instanceof Error?e.message:"Escalação indisponível");
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;controller.abort();};
  },[game.id,expanded,near,refresh]);
  useEffect(()=>{
    if(!expanded||data?.completa)return;
    const interval=window.setInterval(()=>{
      if(document.visibilityState==="visible")setRefresh(n=>n+1);
    },3*60_000);
    return ()=>window.clearInterval(interval);
  },[expanded,data?.completa]);

  const home=data?.equipes.find(t=>t.name.toLowerCase()===game.casa.toLowerCase())||
    data?.equipes[0];
  const away=data?.equipes.find(t=>t!==home&&t.name.toLowerCase()===game.fora.toLowerCase())||
    data?.equipes.find(t=>t!==home);

  const homeCount=home?.starting.length||0,awayCount=away?.starting.length||0;
  return <div className="zlineup-widget">
    <div className="zlineup-summary" aria-label="Situação das escalações">
      <span><span className="zlineup-summary-dot"/> {homeCount?homeCount+" titulares · "+game.casa:"Escalação "+game.casa+": aguardando"}</span>
      <span><span className="zlineup-summary-dot"/> {awayCount?awayCount+" titulares · "+game.fora:"Escalação "+game.fora+": aguardando"}</span>
    </div>
    <button type="button" className="zlineup-toggle" aria-expanded={expanded}
      aria-controls={id} onClick={()=>setExpanded(value=>!value)}>
      <UsersRound size={16} strokeWidth={1.8}/>
      <span>{data?.completa?"Escalações confirmadas":data?.disponivel?"Ver escalação disponível":"Escalação dos times"}</span>
      {data?.completa&&<span className="zlineup-confirmed">OFICIAL</span>}
      <ChevronDown size={15} className={expanded?"is-expanded":""}/>
    </button>
    {expanded&&<section id={id} className="zlineup-expanded" aria-label={"Escalações de "+game.casa+" e "+game.fora}>
      <div className="zlineup-expanded-head">
        <div>
          <small>ESCALAÇÕES · CAMPO TÁTICO</small>
          <strong>{game.casa} <span>×</span> {game.fora}</strong>
        </div>
        <button className="zlineup-reload" type="button" disabled={loading}
          onClick={()=>setRefresh(n=>n+1)} aria-label="Atualizar escalações">
          <RefreshCw size={15} className={loading?"zlineup-loading":""}/>
        </button>
      </div>
      {loading&&!data?<div className="zlineup-pending" role="status"><RefreshCw size={19} className="zlineup-loading"/> Consultando escalações oficiais…</div>
      :error&&!data?<div className="zlineup-pending" role="alert"><CircleHelp size={18}/> {error}</div>
      :!data?.disponivel?<div className="zlineup-pending" role="status">
        <Shirt size={21}/>
        <div><strong>Aguardando escalações</strong><span>O painel será atualizado quando os titulares forem divulgados pela fonte.</span></div>
      </div>
      :<>
        <p className={"zlineup-source"+(!data.completa?" is-partial":"")}>
          {data.completa?"Titulares informados pelo provedor.":"Escalação parcial — nomes não divulgados permanecem vazios."}
          {" "}Fonte: {data.origem}
        </p>
        <div className="zlineup-pitch" aria-label="Campo de futebol, primeira metade mandante, segunda visitante">
          <div className="zlineup-pitch-line" aria-hidden="true"/>
          <div className="zlineup-pitch-circle" aria-hidden="true"/>
          <TeamHalf team={home} side="home" backupName={game.casa} crest={game.escudoCasa}/>
          <TeamHalf team={away} side="away" backupName={game.fora} crest={game.escudoFora}/>
        </div>
        <div className="zlineup-coaches">
          <Coach team={home} backupName={game.casa}/>
          <Coach team={away} backupName={game.fora}/>
        </div>
        <p className="zlineup-footnote">Jogadores distribuídos por posição; o posicionamento exato depende dos dados táticos publicados pela fonte.</p>
      </>}
    </section>}
  </div>;
}
