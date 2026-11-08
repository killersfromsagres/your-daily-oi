"use client";
// src/routes/futebol.tsx — complete daily football guide, Brazil timezone.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight,
  Clock3, RadioTower, RefreshCw, ShieldCheck } from "lucide-react";
import { MatchCard } from "@/components/tv/JogosShelf";
import { FootballIcon } from "@/components/sports/FootballIcon";
import { LeagueStandings } from "@/components/sports/LeagueStandings";
import { addDaysUTC, dataBrasilia, type JogoBrasileirao } from "@/lib/jogos-match";
import { sortedFootballMatches, matchImportance } from "@/lib/football-ranking";
import "@/styles/football-center.css";

export const Route = createFileRoute("/futebol")({
  component: FootballPage,
  head: () => ({
    meta: [
      { title: "Jogos de Hoje — Zang Flix Futebol" },
      { name: "description", content: "Agenda completa de futebol do dia: Brasileirão Série A, Champions League, grandes ligas e os canais identificados no Zang Flix." },
    ],
  }),
});
interface SportsAgendaResponse {
  dataLocal: string;
  atualizadoEm: string;
  jogos: JogoBrasileirao[];
  parcial: boolean;
  erro?: string;
  fontesConsultadas: number;
}
function dateBR(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",...opts}).format(new Date(date+"T12:00:00Z"));
}
const windows = (date: string) => Array.from({length:7},(_,i)=>addDaysUTC(date,i));

function FootballPage() {
  const navigate = useNavigate();
  const [today,setToday] = useState(()=>dataBrasilia());
  const [day,setDay] = useState(()=>dataBrasilia());
  const [data,setData] = useState<SportsAgendaResponse|null>(null);
  const lastSuccessfulDay = useRef<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [revalidate,setRevalidate] = useState(0);
  const days=useMemo(()=>windows(today),[today]);
  const games=useMemo(()=>sortedFootballMatches(data?.dataLocal===day?data.jogos:[]),[data,day]);
  const linked=games.filter(g=>Boolean(g.canalId)).length;
  const live=games.filter(g=>g.status==="ao-vivo").length;
  const availableLeagues=[...new Set(games.map(g=>g.ligaId))].length;

  useEffect(()=>{
    const refreshDate=()=>{
      const current=dataBrasilia();
      if(current!==today){
        setToday(current);
        setDay(current);
        setRevalidate(x=>x+1);
      }
    };
    const t=window.setInterval(refreshDate,60_000);
    return ()=>window.clearInterval(t);
  },[today]);

  useEffect(()=>{
    const controller=new AbortController();
    if (lastSuccessfulDay.current !== day) setLoading(true);
    setError(null);
    fetch("/api/jogos-agenda?data="+encodeURIComponent(day),{
      cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"},
    }).then(async response=>{
      if(!response.ok) throw new Error("Falha HTTP "+response.status);
      const payload=await response.json() as SportsAgendaResponse;
      if(payload.dataLocal!==day||!Array.isArray(payload.jogos))throw new Error("Resposta esportiva inválida");
      return payload;
    }).then(payload=>{if(!controller.signal.aborted){lastSuccessfulDay.current=day;setData(payload);}})
      .catch(reason=>{
        if(!controller.signal.aborted){
          setError(reason instanceof Error ? reason.message:"Agenda indisponível");
          if (lastSuccessfulDay.current !== day) setData(null);
        }
      }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[day,revalidate]);

  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible")setRevalidate(x=>x+1);};
    document.addEventListener("visibilitychange",refresh);
    const timer=window.setInterval(refresh,120_000);
    return ()=>{document.removeEventListener("visibilitychange",refresh);window.clearInterval(timer);};
  },[]);

  const onWatch=useCallback((id:string)=>{
    void navigate({to:"/tv/canal/$id",params:{id}});
  },[navigate]);
  const moveDay=(offset:number)=>{
    const i=days.indexOf(day);
    const next=days[Math.min(6,Math.max(0,i+offset))];
    if(next)setDay(next);
  };
  return (
    <main className="zf-football-page">
      <div className="zf-football-ambient" aria-hidden="true" />
      <div className="zf-football-wrap">
        <div className="zf-football-breadcrumb">
          <Link to="/tv"><ArrowLeft size={16}/> TV ao vivo</Link><span>/</span><FootballIcon size={17}/><strong>Central do Futebol</strong>
        </div>
        <header className="zf-football-hero">
          <div>
            <div className="zf-football-eyebrow"><FootballIcon size={17}/><span>FUTEBOL EM DESTAQUE</span><span className="zf-football-label-line" />HORÁRIO DE BRASÍLIA</div>
            <h1>Todos os <em>jogos do dia.</em></h1>
            <p>Todos os confrontos, horários de Brasília e emissoras informadas para cada partida. A agenda e os placares se atualizam automaticamente.</p>
          </div>
          <div className="zf-football-hero-actions">
            {live>0&&<span className="zf-football-live"><span/> {live} EM ANDAMENTO</span>}
            <button type="button" className="zf-football-refresh" disabled={loading} onClick={()=>setRevalidate(x=>x+1)}>
              <RefreshCw size={15} className={loading?"zf-football-spin":""}/> Atualizar jogos
            </button>
          </div>
        </header>
        <section className="zf-football-calendar" aria-label="Selecione o dia da agenda">
          <div className="zf-football-section-kicker"><CalendarDays size={17}/> CALENDÁRIO DE JOGOS</div>
          <div className="zf-football-days">
            <button className="zf-football-arrow" type="button" aria-label="Dia anterior" onClick={()=>moveDay(-1)} disabled={day===days[0]}><ChevronLeft size={18}/></button>
            <div className="zf-football-days-scroll">
              {days.map((date,index)=>(
                <button type="button" key={date} className={"zf-football-day"+(day===date?" is-current":"")}
                  aria-pressed={day===date} onClick={()=>setDay(date)}>
                  <small>{index===0?"HOJE":index===1?"AMANHÃ":dateBR(date,{weekday:"short"}).replace(".","").toUpperCase()}</small>
                  <strong>{dateBR(date,{day:"2-digit"})}</strong>
                  <span>{dateBR(date,{month:"short"}).replace(".","").toUpperCase()}</span>
                </button>
              ))}
            </div>
            <button className="zf-football-arrow" type="button" aria-label="Próximo dia" onClick={()=>moveDay(1)} disabled={day===days[6]}><ChevronRight size={18}/></button>
          </div>
        </section>
        <section className="zf-football-schedule" aria-live="polite">
          <div className="zf-football-section-row">
            <div>
              <div className="zf-football-section-kicker">AGENDA COMPLETA</div>
              <h2>{dateBR(day,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</h2>
            </div>
            <div className="zf-football-metrics">
              <span><FootballIcon size={18}/>{games.length} jogos</span>
              <span><ShieldCheck size={17}/>{linked} canais identificados</span>
              <span><Activity size={17}/>{availableLeagues} competições</span>
            </div>
          </div>
          {data?.parcial&&!loading&&<p className="zf-football-partial">Algumas competições não responderam à atualização. A agenda pode estar incompleta.</p>}
          {loading ? (
            <div className="zf-football-grid" aria-busy="true">
              {Array.from({length:8},(_,i)=><div key={i} className="zgame-skeleton" aria-hidden="true"/>)}
            </div>
          ) : error || data?.erro ? (
            <div className="zf-football-empty" role="alert">
              <RadioTower size={30}/>
              <h3>Não foi possível consultar a programação</h3>
              <p>{error||data?.erro}</p>
              <button type="button" onClick={()=>setRevalidate(x=>x+1)}>Tentar novamente <RefreshCw size={15}/></button>
            </div>
          ) : games.length===0 ? (
            <div className="zf-football-empty">
              <CalendarDays size={30}/>
              <h3>Nenhum jogo registrado nesta data</h3>
              <p>As partidas só aparecem quando confirmadas pela fonte esportiva. Selecione outro dia.</p>
              <button type="button" onClick={()=>moveDay(1)}>Próximo dia <ArrowRight size={15}/></button>
            </div>
          ) : (
            <>
              <div className="zf-football-guide-note"><FootballIcon size={17}/> Ordenados por relevância: Brasileirão Série A, Champions, confrontos de grandes clubes e outras ligas.</div>
              <div className="zf-football-grid">
                {games.map((game,index)=>(
                  <div key={game.id} className={"zf-football-match"+(index<4&&matchImportance(game)>=400?" is-featured":"")}>
                    <MatchCard game={game} onWatch={onWatch} onExplore={()=>void navigate({to:"/tv"})}/>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        <LeagueStandings compact={false} />
        <footer className="zf-football-footer"><Clock3 size={15}/> Horários no fuso de Brasília. Os botões de assistir aparecem apenas quando há identificação específica do canal brasileiro. Programação sujeita a alterações.</footer>
      </div>
    </main>
  );
}
