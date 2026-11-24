import {useState,useEffect} from "react";
import {ArrowUpRight,ChevronRight,Play,Radio,Trophy} from "lucide-react";
import {useHomeFootball} from "@/lib/use-home-football";
import {getMatchCardVisual} from "@/lib/match-card-visual";
import {webBroadcastState} from "@/lib/web-broadcast-state";
import type {JogoBrasileirao} from "@/lib/jogos-match";
import {tvReadFocus} from "@/lib/tv-focus";
import "@/styles/home-football.css";
type Props={television?:boolean;onWatch:(id:string)=>void;onAgenda:()=>void};
function Crest({name,src}:{name:string;src?:string|null}){
 const [broken,setBroken]=useState(false);useEffect(()=>setBroken(false),[src]);
 return src&&!broken?<img src={src} alt="" width={52} height={52} loading="lazy" decoding="async" onError={()=>setBroken(true)}/>:<span className="zf-home-football-crest-fallback" aria-hidden="true">{name.split(" ").slice(0,2).map(word=>word[0]).join("").toUpperCase()}</span>;
}
function GameCard({game,now,television,onWatch,index}:{game:JogoBrasileirao;now:number;television:boolean;onWatch:(id:string)=>void;index:number}){
 const state=webBroadcastState(game,now);const visual=getMatchCardVisual(game,now);
 const live=game.status==="ao-vivo";const channel=state.internal?game.canalNome:state.official?.provider;
 const activate=()=>{const fresh=webBroadcastState(game,Date.now());if(fresh.internal&&game.canalId)onWatch(game.canalId);else if(!television&&fresh.official)window.open(fresh.official.href,"_blank","noopener,noreferrer");};
 return <button type="button" className={"zf-home-football-card"+(live?" is-live":"")} onClick={activate}
   data-tv-focus={television?"home-game-"+game.id:undefined} data-tv-left-target={television&&index===0?"nav-all":undefined}
   aria-label={game.casa+" contra "+game.fora+" · "+(live?"Ao vivo":game.horarioLocal)+" · "+channel+(state.official?" · requer assinatura":"")}>
   <span className="zf-home-football-card-top"><span className="zf-home-football-league">{game.ligaLogo?<img src={game.ligaLogo} alt="" width={20} height={20} loading="lazy"/>:<Trophy size={15}/>}<span>{game.liga}</span></span><span className="zf-home-football-status">{live&&<i/>}{live?(game.fase==="intervalo"?"Intervalo":"Ao vivo"):visual.phase==="soon"?"Em breve":"Hoje"}</span></span>
   <span className="zf-home-football-teams"><span className="zf-home-football-team"><Crest name={game.casa} src={game.escudoCasa}/><strong>{game.casa}</strong></span>
   <span className="zf-home-football-score"><strong>{visual.showScore?visual.scoreHome+" – "+visual.scoreAway:live?"—":game.horarioLocal}</strong><small>{live?(game.minuto||game.faseRotulo||"Ao vivo"):"Brasília"}</small></span>
   <span className="zf-home-football-team"><Crest name={game.fora} src={game.escudoFora}/><strong>{game.fora}</strong></span></span>
   <span className="zf-home-football-bottom"><span className="zf-home-football-channel">{state.internal&&game.canalLogo?<img src={game.canalLogo} alt="" width={24} height={18} loading="lazy"/>:<Radio size={15}/>}<span>{channel}{state.official&&!state.internal?" · assinatura":""}</span></span><span className="zf-home-football-action">{state.official&&!state.internal?<ArrowUpRight size={15}/>:<Play size={12} fill="currentColor"/>}<span>{live?"Assistir":"Ver canal"}</span></span></span>
 </button>;
}
export function HomeFootball({television=false,onWatch,onAgenda}:Props){
 const {featured,ready,failed,now}=useHomeFootball(!television);
 useEffect(()=>{
  if(!television||!featured.length)return;
  const id=tvReadFocus("home");if(!id.startsWith("home-game-"))return;
  const active=document.activeElement;if(active!==document.body&&!(active instanceof HTMLElement&&active.dataset["tvFocus"]==="nav-all"))return;
  const frame=requestAnimationFrame(()=>{const target=[...document.querySelectorAll<HTMLElement>(".zf-home-football [data-tv-focus]")].find(el=>el.dataset["tvFocus"]===id);if(target&&(document.activeElement===active||document.activeElement===document.body))target.focus();});
  return()=>cancelAnimationFrame(frame);
 },[television,featured.length]);
 if(!ready&&!featured.length)return null;
 return <section className={"zf-home-football"+(television?" is-tv":"")+(featured.length?"":" is-empty")} aria-label="Jogos em destaque hoje">
  <header className="zf-home-football-head" data-tv-row={television?"home-sports-heading":undefined}>
   <div><span className="zf-home-football-kicker"><span/> ZANG FLIX SPORTS</span><h2>Jogos em destaque hoje</h2>{!featured.length&&<p>{failed?"A programação está sendo atualizada.":"Nenhuma transmissão confirmada no momento."}</p>}</div>
   <button type="button" className="zf-home-football-all" onClick={onAgenda} data-tv-focus={television?"home-sports-all":undefined} data-tv-left-target={television?"nav-all":undefined}>{television?"Todos os jogos":"Ver todos os jogos"}<ChevronRight size={18}/></button>
  </header>
  {!!featured.length&&<div className="zf-home-football-track" data-tv-row={television?"home-sports-cards":undefined}>{featured.map((g,i)=><GameCard key={g.id} game={g} now={now} television={television} onWatch={onWatch} index={i}/>)}</div>}
 </section>;
}
