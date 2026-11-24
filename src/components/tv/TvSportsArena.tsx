import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Radio,RefreshCw,Trophy,Play,Shield,ChevronRight} from "lucide-react";
import {dataBrasilia,type JogoBrasileirao} from "@/lib/jogos-match";
import {mergeFootballScores,sortedFootballMatches,liveScoreLeagueIds} from "@/lib/football-ranking";
type Feed={dataLocal:string;atualizadoEm:string;jogos:JogoBrasileirao[];parcial?:boolean};
type Filter="all"|"live"|"scheduled"|"finished";
const FILTERS:ReadonlyArray<{id:Filter;label:string}>=[{id:"all",label:"Todos"},{id:"live",label:"Ao vivo"},{id:"scheduled",label:"Programados"},{id:"finished",label:"Encerrados"}];
async function requestFeed(path:string,day:string,signal:AbortSignal):Promise<Feed>{
 const r=await fetch(path,{cache:"no-store",signal});if(!r.ok)throw Error("HTTP "+r.status);
 const data=await r.json() as Feed;if(data.dataLocal!==day||!Array.isArray(data.jogos))throw Error("Agenda inválida");return data;
}
function Crest({url,name}:{url:string|null|undefined;name:string}){const [bad,setBad]=useState(false);useEffect(()=>setBad(false),[url]);return url&&!bad?<img src={url} alt="" loading="lazy" decoding="async" onError={()=>setBad(true)}/>:<span aria-label={name}>{name.split(" ").slice(0,2).map(x=>x[0]||"").join("").toUpperCase()}</span>}
export function TvSportsArena({onWatch}:{onWatch:(id:string)=>void}){
 const [day,setDay]=useState(()=>dataBrasilia());const [agenda,setAgenda]=useState<Feed|null>(null);const [scores,setScores]=useState<Feed|null>(null);
 const [filter,setFilter]=useState<Filter>("all");const [league,setLeague]=useState("all");const [tick,setTick]=useState(0);const [scoreTick,setScoreTick]=useState(0);const [error,setError]=useState(false);const [scoreError,setScoreError]=useState(false);const [loading,setLoading]=useState(true);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible"){setDay(dataBrasilia());setTick(x=>x+1);}};const timer=window.setInterval(refresh,90000);document.addEventListener("visibilitychange",refresh);return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh)}},[]);
 useEffect(()=>{const c=new AbortController();let disposed=false;const timer=window.setTimeout(()=>c.abort(),18000);setLoading(true);requestFeed("/api/jogos-agenda?data="+encodeURIComponent(day),day,c.signal).then(d=>{if(!disposed){setAgenda(d);setError(false)}}).catch(()=>{if(!disposed)setError(true)}).finally(()=>{window.clearTimeout(timer);if(!disposed)setLoading(false)});return()=>{disposed=true;window.clearTimeout(timer);c.abort()}},[day,tick]);
 const base=useMemo(()=>agenda?.dataLocal===day?agenda.jogos:[],[agenda,day]);
 const leagues=liveScoreLeagueIds(base,Date.now()).join(",");
 useEffect(()=>{if(!base.length)return;const timer=window.setInterval(()=>{if(document.visibilityState==="visible")setScoreTick(x=>x+1)},30000);return()=>window.clearInterval(timer)},[base.length]);
 useEffect(()=>{if(!base.length)return;const c=new AbortController();let disposed=false;const timer=window.setTimeout(()=>c.abort(),15000);const params=new URLSearchParams({data:day});if(leagues)params.set("ligas",leagues);requestFeed("/api/jogos-placares?"+params.toString(),day,c.signal).then(d=>{if(!disposed){setScores(d);setScoreError(false)}}).catch(()=>{if(!disposed)setScoreError(true)}).finally(()=>window.clearTimeout(timer));return()=>{disposed=true;c.abort();window.clearTimeout(timer)}},[day,leagues,scoreTick,base]);
 const games=useMemo(()=>sortedFootballMatches(mergeFootballScores(base,scores?.dataLocal===day&&(!agenda||Date.parse(scores.atualizadoEm)>=Date.parse(agenda.atualizadoEm))?scores.jogos:[],day)),[base,scores,agenda,day]);
 const live=games.filter(g=>g.status==="ao-vivo").length;
 const competitions=[...new Map(games.map(g=>[g.ligaId,g.liga])).entries()];
 const filtered=games.filter(g=>(league==="all"||g.ligaId===league)&&(filter==="all"||filter==="live"&&g.status==="ao-vivo"||filter==="scheduled"&&g.status==="agendado"||filter==="finished"&&g.status==="encerrado"));
 const date=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(day+"T12:00:00Z"));
 return <section className="zf-tv-arena" aria-label="Jogos de hoje">
 <header className="zf-arena-hero"><div className="zf-arena-pitch" aria-hidden="true"><div/><i/><b/></div><div className="zf-arena-hero-copy"><span className="zf-arena-kicker"><Trophy size={18}/> ZANG FLIX SPORTS</span><h1>Jogos de hoje</h1><p><CalendarDays size={18}/> {date} <span>· Horário de Brasília</span></p><div className="zf-arena-metrics"><span><Radio size={17}/> {live} ao vivo</span><span>{games.length} partidas</span></div></div><button type="button" className="zf-arena-refresh" data-tv-focus="sports-refresh" data-tv-row="sports-header" data-tv-left-target="nav-sports" data-tv-down-target="sports-filter-all" onClick={()=>{setTick(x=>x+1);setScoreTick(x=>x+1)}}><RefreshCw size={19}/> Atualizar</button></header>
 <div className="zf-arena-filter" data-tv-row="sports-filters">{FILTERS.map(f=><button type="button" key={f.id} data-tv-focus={"sports-filter-"+f.id} data-tv-left-target={f.id==="all"?"nav-sports":undefined} aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.label}</button>)}</div>
 <div className="zf-arena-leagues" data-tv-row="sports-leagues"><button type="button" data-tv-focus="sports-league-all" data-tv-left-target="nav-sports" aria-pressed={league==="all"} onClick={()=>setLeague("all")}>Competições</button>{competitions.map(([id,name])=><button type="button" key={id} data-tv-focus={"sports-league-"+id} aria-pressed={league===id} onClick={()=>setLeague(id)}>{name}</button>)}</div>
 <div className="zf-arena-list-head"><h2>{filter==="live"?"Em andamento":filter==="scheduled"?"Próximas partidas":filter==="finished"?"Resultados":"Agenda do dia"}</h2><small>{scoreError||error?"Atualização temporariamente indisponível":scores?"Placares atualizados automaticamente":"Dados da agenda"}</small></div>
 {(agenda?.parcial||error)&&<p className="zf-arena-notice">A programação pode estar incompleta. Atualize para consultar novamente.</p>}
 {loading&&!games.length?<p className="zf-arena-notice">Carregando a agenda…</p>:!filtered.length?<p className="zf-arena-notice">{error?"Não foi possível consultar os jogos.":"Nenhuma partida nesta seleção."}</p>:<div className="zf-arena-grid">{filtered.map((g,index)=>{
 const active=g.status==="ao-vivo",finished=g.status==="encerrado";const score=(active||finished)&&g.placarCasa!=null&&g.placarFora!=null;
 const channel=g.transmissao==="confirmada"&&(active||g.status==="agendado")?(g.canalId||g.canaisDisponiveis?.[0]?.id||""):"";
 const label=active?(g.faseRotulo||"Ao vivo")+(g.minuto?" · "+g.minuto:""):finished?"Encerrado":g.status==="adiado"?"Adiado":"Programado";
 return <button type="button" className={"zf-arena-match"+(active?" is-live":"")} key={g.id} data-tv-focus={"sports-match-"+g.id} data-tv-row={"sports-match-row-"+Math.floor(index/2)} data-tv-left-target={index%2===0?"nav-sports":undefined} aria-disabled={!channel} onClick={()=>{if(channel)onWatch(channel)}} aria-label={g.casa+" contra "+g.fora+" — "+label+(channel?" — assistir":" — transmissão indisponível")}>
 <div className="zf-arena-match-top"><span><Crest url={g.ligaLogo} name={g.liga}/>{g.liga}</span><span className="zf-arena-phase">{active&&<i/>}{label}</span></div>
 <div className="zf-arena-teams"><div><Crest url={g.escudoCasa} name={g.casa}/><strong>{g.casa}</strong></div><div className="zf-arena-score"><strong>{score?g.placarCasa+" – "+g.placarFora:active||finished?"—":g.status==="adiado"?"—":g.horarioLocal}</strong><small>{score?"PLACAR":active||finished?"PLACAR INDISPONÍVEL":"BRASÍLIA"}</small></div><div><Crest url={g.escudoFora} name={g.fora}/><strong>{g.fora}</strong></div></div>
 <div className="zf-arena-match-bottom"><span>{channel?<><Play size={15} fill="currentColor"/> {g.canalNome||g.canaisDisponiveis?.[0]?.nome||"Canal confirmado"}</>:<><Shield size={15}/> {finished?"Partida encerrada":g.canaisTransmissao?.length?g.canaisTransmissao.join(" · ")+" · sem acesso direto":"Transmissão não confirmada"}</>}</span>{channel&&<ChevronRight size={19}/>}</div>
 </button>})}</div>}
 </section>
}
