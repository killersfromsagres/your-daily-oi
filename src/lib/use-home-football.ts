import {useEffect,useMemo,useState} from "react";
import {dataBrasilia,type JogoBrasileirao} from "./jogos-match";
import {liveScoreLeagueIds,mergeFootballScores} from "./football-ranking";
import {homeFootballMatches} from "./football-home-selection";
import {useMatchCardClock} from "./use-match-card-clock";
type Feed={dataLocal:string;atualizadoEm:string;jogos:JogoBrasileirao[];parcial?:boolean;erro?:string};
async function request(path:string,day:string,signal:AbortSignal):Promise<Feed>{
 const res=await fetch(path,{cache:"no-store",signal,headers:{Accept:"application/json"}});
 if(!res.ok)throw Error("Agenda HTTP "+res.status);
 const data=await res.json() as Feed;
 if(data.dataLocal!==day||!Array.isArray(data.jogos)||!Number.isFinite(Date.parse(data.atualizadoEm)))throw Error("Agenda inválida");
 return data;
}
export function useHomeFootball(allowOfficial:boolean){
 const now=useMatchCardClock();
 const [day,setDay]=useState(()=>dataBrasilia());
 const [agenda,setAgenda]=useState<Feed|null>(null);
 const [scores,setScores]=useState<Feed|null>(null);
 const [failed,setFailed]=useState(false);
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let disposed=false;let pending:AbortController|null=null;let deadline:number|undefined;
  const update=async()=>{
   if(disposed||document.visibilityState==="hidden"||pending)return;
   const date=dataBrasilia();setDay(date);const c=new AbortController();pending=c;
   deadline=window.setTimeout(()=>c.abort(),45000);
   try{const value=await request("/api/jogos-agenda?data="+encodeURIComponent(date),date,c.signal);
    if(!disposed&&!c.signal.aborted){setAgenda(old=>old?.dataLocal===date&&value.erro&&!value.jogos.length?old:value);setFailed(Boolean(value.erro||value.parcial));}}
   catch{if(!disposed)setFailed(true);}
   finally{window.clearTimeout(deadline);if(pending===c)pending=null;if(!disposed)setReady(true);}
  };
  const visible=()=>{if(document.visibilityState==="visible")void update();};
  void update();const timer=window.setInterval(update,90000);
  document.addEventListener("visibilitychange",visible);window.addEventListener("online",visible);
  return()=>{disposed=true;pending?.abort();window.clearTimeout(deadline);window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("online",visible);};
 },[]);
 const base=useMemo(()=>agenda?.dataLocal===day?agenda.jogos:[],[agenda,day]);
 const leagues=useMemo(()=>liveScoreLeagueIds(base,now||Date.now()).join(","),[base,now]);
 useEffect(()=>{
  if(!leagues)return;
  let disposed=false;let pending:AbortController|null=null;let deadline:number|undefined;
  const update=async()=>{
   if(disposed||document.visibilityState==="hidden"||pending)return;
   const c=new AbortController();pending=c;deadline=window.setTimeout(()=>c.abort(),20000);
   const params=new URLSearchParams({data:day,ligas:leagues});
   try{const value=await request("/api/jogos-placares?"+params.toString(),day,c.signal);if(!disposed&&!c.signal.aborted)setScores(value);}
   catch{/* preserve last good scoreboard; freshness is checked separately */}
   finally{window.clearTimeout(deadline);if(pending===c)pending=null;}
  };
  void update();const timer=window.setInterval(update,30000);
  return()=>{disposed=true;pending?.abort();window.clearTimeout(deadline);window.clearInterval(timer);};
 },[day,leagues]);
 const games=useMemo(()=>mergeFootballScores(base,scores?.dataLocal===day&&agenda&&Date.parse(scores.atualizadoEm)>=Date.parse(agenda.atualizadoEm)?scores.jogos:[],day),[base,scores,agenda,day]);
 const featured=useMemo(()=>homeFootballMatches(games,day,now,6,allowOfficial),[games,day,now,allowOfficial]);
 return {featured,ready,failed,now};
}
