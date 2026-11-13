// scripts/smoke-football-production.mjs — HTTP verification of published agenda, broadcaster and lineup APIs.
import { dataBrasilia } from "../src/lib/jogos-match.ts";
const base=process.env.ZANG_BASE||"https://zangflix.vercel.app";
const date=dataBrasilia();
async function jsonRoute(label,path,timeout=25000){
  const started=Date.now();
  const response=await fetch(base+path,{
    signal:AbortSignal.timeout(timeout),
    headers:{Accept:"application/json"},
  });
  const contentType=response.headers.get("content-type")||"";
  if(!contentType.includes("application/json"))throw new Error(label+" served "+contentType+" HTTP "+response.status);
  const body=await response.json();
  console.log(JSON.stringify({label,http:response.status,ms:Date.now()-started,
    total:body.jogos?.length,provider:body.origem,partial:body.parcial,
    sample:body.jogos?.slice(0,5).map(x=>({id:x.id,match:x.casa+" x "+x.fora,canal:x.canalNome||null})),
    available:body.disponivel,complete:body.completa,players:body.equipes?.map(t=>({name:t.name,starters:t.starting?.length,coach:t.coach?.name||null}))}));
  if(!response.ok)throw new Error(label+" returned "+response.status+" "+String(body?.erro||""));
  return body;
}
const agenda=await jsonRoute("agenda","/api/jogos-agenda?data="+date,27000);
if(!Array.isArray(agenda.jogos))throw new Error("Agenda missing jogos array");
if(date==="2026-11-13"&&agenda.jogos.length<2)throw new Error("TheSportsDB fallback still not present in ZANG agenda");
const partial=await jsonRoute("published-player-lineup","/api/jogos-escalacao?jogo=sportsdb%3A1032723",16000);
if(partial.equipes?.some(team=>team.starting?.length>11))
  throw new Error("Provider returned more than eleven starters for one team");
if(!Array.isArray(partial.equipes)||!partial.equipes.some(t=>t.starting?.length))
  throw new Error("Real lineup provider did not return published starters");
const todayGame=agenda.jogos[0];
if(todayGame){
  const todayLineup=await jsonRoute("today-lineup","/api/jogos-escalacao?jogo="+encodeURIComponent(todayGame.id),16000);
  if(todayLineup.equipes?.some(team=>team.starting?.length>11))
    throw new Error("Reserves incorrectly rendered as starters for "+todayGame.id);
  if(todayLineup.completa && !todayLineup.equipes.every(team=>team.starting?.length===11))
    throw new Error("Lineup marked complete without two confirmed starting XIs");
}
console.log(JSON.stringify({event:"football-production-smoke",result:"passed",date,fixtures:agenda.jogos.length}));
