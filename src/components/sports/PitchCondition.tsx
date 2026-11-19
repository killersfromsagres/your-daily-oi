"use client";
import {useEffect,useMemo,useState} from "react";
import type {JogoBrasileirao} from "@/lib/jogos-match";
import {getRegionalPitchEstimate,resolveVenueCity,type PitchEstimate} from "@/lib/pitch-weather";

/** Monochrome football pitch pictogram matching the stadium icon. */
export function PitchOutlineIcon({size=27}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    <rect x="2.4" y="5" width="27.2" height="22" rx="2.7"/>
    <path d="M16 5v22"/>
    <circle cx="16" cy="16" r="4.8"/>
    <circle cx="16" cy="16" r=".8" fill="currentColor" stroke="none"/>
    <path d="M2.4 10h5.2v12H2.4M29.6 10h-5.2v12h5.2M2.4 13.1h2.3v5.8H2.4M29.6 13.1h-2.3v5.8h2.3"/>
  </svg>;
}
type PitchReply = Partial<PitchEstimate> & {condicao?:string};
const clientCache=new Map<string,{until:number;value:PitchReply}>();
const inFlight=new Map<string,Promise<PitchReply>>();
const unavailable:PitchReply={condicao:"indisponivel"};
const isUsable=(value:PitchReply):boolean=>
  value.condicao==="seco"||value.condicao==="molhado";

/** Primary route is first-party. Fallback to the public weather API from the
 * browser only if the app's weather route is absent or temporarily unavailable.
 */
async function readPitch(key:string,params:URLSearchParams):Promise<PitchReply> {
  const cached=clientCache.get(key);
  if(cached&&cached.until>Date.now())return cached.value;
  let pending=inFlight.get(key);
  if(!pending){
    pending=(async()=>{
      try{
        const response=await fetch("/api/jogos-gramado?"+params.toString(),{
          cache:"no-store", signal:AbortSignal.timeout(10_000),
        });
        if(response.ok){
          const result=await response.json() as PitchReply;
          if(isUsable(result))return result;
        }
      }catch{/* An older deployment might not yet expose /api/jogos-gramado. */}
      try{
        const direct=await getRegionalPitchEstimate({
          estadio:params.get("estadio")||undefined,
          cidade:params.get("cidade")||undefined,
          pais:params.get("pais")||undefined,
        });
        if(direct&&isUsable(direct))return direct;
      }catch{/* No verified weather — never assume the pitch is dry. */}
      return unavailable;
    })().then(value=>{
      if(clientCache.size>=90)clientCache.delete(clientCache.keys().next().value!);
      clientCache.set(key,{
        until:Date.now()+(isUsable(value)?3*60_000:30_000),value,
      });
      return value;
    }).finally(()=>inFlight.delete(key));
    inFlight.set(key,pending);
  }
  return pending;
}

/** Regional weather is refreshed automatically; physical turf is not sensed. */
export function PitchCondition({game}:{game:JogoBrasileirao}){
  const city=resolveVenueCity(game.estadio,game.cidadeEstadio);
  const [value,setValue]=useState<PitchReply|null>(null);
  const [refresh,setRefresh]=useState(0);
  const query=useMemo(()=>{
    if(!city)return null;
    return new URLSearchParams({
      estadio:game.estadio||"",cidade:city,pais:game.paisEstadio||"",
    });
  },[city,game.estadio,game.paisEstadio]);
  const queryKey=query?.toString()||"";
  useEffect(()=>{
    if(!query){setValue(unavailable);return;}
    let active=true;
    const key=queryKey;
    const load=()=>{
      if(document.visibilityState==="hidden")return;
      void readPitch(key,query).then(result=>{
        if(active)setValue(result);
      }).catch(()=>{if(active)setValue(unavailable);});
    };
    load();
    return()=>{active=false;};
  },[query,queryKey,refresh]);
  useEffect(()=>{
    if(!query)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=="hidden")setRefresh(x=>x+1);
    },3*60_000);
    const onVisible=()=>{
      if(document.visibilityState==="visible")setRefresh(x=>x+1);
    };
    document.addEventListener("visibilitychange",onVisible);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[queryKey]);

  const state=value?.condicao;
  const label=state==="molhado"?"Gramado molhado":
    state==="seco"?"Gramado seco":
    state==="indisponivel"?"Clima indisponível":"Consultando clima…";
  const details=state==="molhado"||state==="seco"
    ? (value?.resumo||"Condição do tempo na região")+
      (typeof value?.chuvaMm==="number"?" · "+value.chuvaMm.toFixed(2)+" mm":"")+
      " · "+(value?.cidade||city||"Estádio")+
      " · modelo atual Open-Meteo; não mede a umidade real do gramado."
    :"Não foi possível confirmar a chuva ou garoa na localização do estádio.";
  return <span className={"zf-ticket-pitch is-"+(state||"loading")}
    data-weather-state={state||"loading"} title={details}
    aria-label={"Condição estimada do campo: "+label+". "+details}>
    <PitchOutlineIcon size={27}/>
    <span className="zf-ticket-pitch-copy">
      <small>CONDIÇÃO DO CAMPO · ESTIMATIVA</small><strong>{label}</strong>
    </span>
  </span>;
}
