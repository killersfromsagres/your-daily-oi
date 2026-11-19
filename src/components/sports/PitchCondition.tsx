"use client";
import {useEffect,useMemo,useState} from "react";
import type {JogoBrasileirao} from "@/lib/jogos-match";
import type {PitchEstimate} from "@/lib/pitch-weather";
import {resolveVenueCity} from "@/lib/pitch-weather";

/** White football pitch outline, matching the monochrome stadium pictogram. */
export function PitchOutlineIcon({size=27}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
    stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    <rect x="2.4" y="5" width="27.2" height="22" rx="2.7"/>
    <path d="M16 5v22M16 5c-4.9 4.5-4.9 17.5 0 22" opacity=".0"/>
    <circle cx="16" cy="16" r="4.8"/>
    <circle cx="16" cy="16" r=".8" fill="currentColor" stroke="none"/>
    <path d="M2.4 10h5.2v12H2.4M29.6 10h-5.2v12h5.2M2.4 13.1h2.3v5.8H2.4M29.6 13.1h-2.3v5.8h2.3"/>
  </svg>;
}
type PitchReply = Partial<PitchEstimate> & {condicao?:string};
const clientCache=new Map<string,{until:number;value:PitchReply}>();
const inFlight=new Map<string,Promise<PitchReply>>();
const readPitch=async(key:string,params:URLSearchParams):Promise<PitchReply>=>{
  const cached=clientCache.get(key);
  if(cached&&cached.until>Date.now())return cached.value;
  let inflight=inFlight.get(key);
  if(!inflight){
    inflight=fetch("/api/jogos-gramado?"+params.toString(),{cache:"no-store"})
      .then(async res=>{
        if(!res.ok)throw new Error("Clima indisponível");
        return res.json() as Promise<PitchReply>;
      })
      .then(value=>{
        if(clientCache.size>=90)clientCache.delete(clientCache.keys().next().value!);
        clientCache.set(key,{until:Date.now()+10*60_000,value});
        return value;
      })
      .finally(()=>inFlight.delete(key));
    inFlight.set(key,inflight);
  }
  return inflight;
};
/** An estimate of rain near a stadium, not a physical turf moisture measurement. */
export function PitchCondition({game}:{game:JogoBrasileirao}){
  const city=resolveVenueCity(game.estadio,game.cidadeEstadio);
  const [value,setValue]=useState<PitchReply|null>(null);
  const [refresh,setRefresh]=useState(0);
  const query=useMemo(()=>{
    if(!city || !Number.isFinite(Date.parse(game.inicioIso)))return null;
    const p=new URLSearchParams({estadio:game.estadio||"",
      cidade:city, pais:game.paisEstadio||"",inicio:game.inicioIso,
      aoVivo:game.status==="ao-vivo"?"1":"0"});
    return p;
  },[city,game.estadio,game.paisEstadio,game.inicioIso,game.status]);
  useEffect(()=>{
    if(!query){setValue({condicao:"indisponivel"});return;}
    let active=true;
    setValue(null);
    const cacheKey=query.toString()+(game.status==="ao-vivo"?":"+Math.floor(Date.now()/(10*60_000)):"");
    void readPitch(cacheKey,query).then(result=>{
      if(active)setValue(result);
    }).catch(()=>{if(active)setValue({condicao:"indisponivel"});});
    return()=>{active=false;};
  },[query,refresh,game.status]);
  useEffect(()=>{
    if(game.status!=="ao-vivo" || !query)return;
    const timer=window.setInterval(()=>setRefresh(x=>x+1),10*60_000);
    return()=>window.clearInterval(timer);
  },[game.status,query]);
  const state=value?.condicao;
  const label=state==="molhado"?"Gramado molhado (estim.)":
    state==="seco"?"Gramado seco (estim.)":
    state==="indisponivel"?"Gramado a confirmar":"Analisando clima…";
  const details=state==="molhado"||state==="seco"
    ? (value?.resumo||"Estimativa de chuva na região")+
      (typeof value?.chuvaMm==="number"?" · "+value.chuvaMm.toFixed(1)+" mm":"")+
      " · Open-Meteo; não é medição do gramado."
    :"Condição do gramado não confirmada; sem dados meteorológicos confiáveis para o local.";
  return <span className={"zf-ticket-pitch is-"+(state||"loading")}
    title={details} aria-label={"Condição estimada do campo: "+label+". "+details}>
    <PitchOutlineIcon size={27}/>
    <span className="zf-ticket-pitch-copy">
      <small>CONDIÇÃO DO CAMPO · ESTIMATIVA</small><strong>{label}</strong>
    </span>
  </span>;
}
