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
import { sortedFootballMatches, matchImportance, mergeFootballScores, liveScoreLeagueIds, isBrazilFixture } from "@/lib/football-ranking";
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
interface LiveScoresResponse {
  dataLocal: string;
  atualizadoEm: string;
  jogos: JogoBrasileirao[];
  parcial: boolean;
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
  const [scoreRefresh,setScoreRefresh] = useState(0);
  const [scores,setScores] = useState<LiveScoresResponse|null>(null);
  const [scoresUnavailable,setScoresUnavailable] = useState(false);
  const days=useMemo(()=>windows(today),[today]);
  const agendaGames=useMemo(()=>data?.dataLocal===day?data.jogos:[],[data,day]);
  const watchedLeagues=useMemo(()=>liveScoreLeagueIds(agendaGames,Date.now()),[agendaGames,scoreRefresh]);
  const leagueParam=watchedLeagues.join(",");
  const scoreGames=useMemo(()=>{
    if(scores?.dataLocal!==day)return [];
    // Never let an older scoreboard response overwrite a newer complete agenda.
    if(data?.dataLocal===day && Date.parse(scores.atualizadoEm)<Date.parse(data.atualizadoEm))return [];
    return scores.jogos;
  },[scores,data,day]);
  const games=useMemo(()=>sortedFootballMatches(mergeFootballScores(agendaGames,scoreGames,day)),[agendaGames,scoreGames,day]);
  // A genuine Brazil fixture is pinned once at the top, whether upcoming or
  // live. No duplicate card appears in the live or remaining sections.
  const brazilGames=useMemo(()=>games.filter(isBrazilFixture),[games]);
  const liveGames=useMemo(()=>games.filter(g=>g.status==="ao-vivo"&&!isBrazilFixture(g)),[games]);
  const remainingGames=useMemo(()=>games.filter(g=>g.status!=="ao-vivo"&&!isBrazilFixture(g)),[games]);
  const linked=games.filter(g=>Boolean(g.canalId)).length;
  const live=games.filter(g=>g.status==="ao-vivo").length;
  const availableLeagues=[...new Set(games.map(g=>g.ligaId))].length;
  const scoresUpdated = scores?.dataLocal===day && Number.isFinite(Date.parse(scores.atualizadoEm)) ?
    new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(scores.atualizadoEm)) : null;

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
        if(!controller.signal.aborted && lastSuccessfulDay.current!==day){
          setError(reason instanceof Error ? reason.message:"Agenda indisponível");
          setData(null);
        }
      }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[day,revalidate]);

  // Keep channel/EPG enrichment independent from the fast score refresh.
  useEffect(()=>{
    const controller=new AbortController();
    if(day!==today || data?.dataLocal!==day) return;
    const params=new URLSearchParams({data:day});
    if(leagueParam)params.set("ligas",leagueParam);
    fetch("/api/jogos-placares?"+params.toString(),{
      cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"},
    }).then(async response=>{
      if(!response.ok)throw new Error("Placar indisponível");
      const result=await response.json() as LiveScoresResponse;
      if(result.dataLocal!==day||!Array.isArray(result.jogos))throw new Error("Placar inválido");
      return result;
    }).then(result=>{
      if(!controller.signal.aborted){setScores(result);setScoresUnavailable(false);}
    }).catch(()=>{
      if(!controller.signal.aborted)setScoresUnavailable(true);
    });
    return ()=>controller.abort();
  },[day,today,data,scoreRefresh,leagueParam]);

  useEffect(()=>{
    const refresh=()=>{
      if(document.visibilityState==="visible"){
        setRevalidate(x=>x+1);
        setScoreRefresh(x=>x+1);
      }
    };
    document.addEventListener("visibilitychange",refresh);
    const slow=window.setInterval(refresh,90_000);
    return ()=>{document.removeEventListener("visibilitychange",refresh);window.clearInterval(slow);};
  },[]);

  useEffect(()=>{
    if(day!==today || !agendaGames.length)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState==="visible")setScoreRefresh(x=>x+1);
    },leagueParam?30_000:75_000);
    return ()=>window.clearInterval(timer);
  },[day,today,agendaGames.length,leagueParam]);

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
              {live>0&&<span className="zf-football-live-count"><RadioTower size={17}/>{live} ao vivo</span>}
              <span><ShieldCheck size={17}/>{linked} canais identificados</span>
              <span><Activity size={17}/>{availableLeagues} competições</span>
            </div>
          </div>
          {data?.parcial&&!loading&&<p className="zf-football-partial">Algumas competições não responderam à atualização. A agenda pode estar incompleta.</p>}
          {day===today&&agendaGames.length>0&&(
            <div className="zf-football-score-status" role="status">
              <span className={scoresUnavailable?" is-delayed":""}>
                <span className="zf-football-feed-dot"/>
                {scoresUnavailable?"Atualização ao vivo temporariamente indisponível":scoresUpdated?"Placar sincronizado às "+scoresUpdated+" (Brasília)":"Sincronizando placares"}
              </span>
              <span>Consulta automática durante os jogos</span>
            </div>
          )}
          {loading && !agendaGames.length ? (
            <div className="zf-football-grid" aria-busy="true">
              {Array.from({length:8},(_,i)=><div key={i} className="zgame-skeleton" aria-hidden="true"/>)}
            </div>
          ) : (error || data?.erro) && !agendaGames.length ? (
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
              {brazilGames.length>0&&(
                <section className="zf-football-brazil-section" aria-label="Jogos da Seleção Brasileira em destaque">
                  <div className="zf-football-brazil-head">
                    <span>BRASIL EM DESTAQUE</span>
                    <strong>Seleção Brasileira</strong>
                    <small>Partidas reais da agenda · atualizadas automaticamente</small>
                  </div>
                  <div className="zf-football-grid">
                    {brazilGames.map(game=>(
                      <div key={game.id} className="zf-football-match is-featured">
                        <MatchCard game={game} onWatch={onWatch} onExplore={()=>void navigate({to:"/tv"})}/>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {liveGames.length>0&&(
                <section className="zf-football-live-section" aria-label="Jogos em andamento">
                  <div className="zf-football-live-head">
                    <span className="zf-football-live-heading"><RadioTower size={17}/> AGORA AO VIVO <strong>{liveGames.length}</strong></span>
                    <span>Gols, tempo de partida e transmissão disponível</span>
                  </div>
                  <div className="zf-football-grid">
                    {liveGames.map(game=>(
                      <div key={game.id} className="zf-football-match is-live-featured">
                        <MatchCard game={game} onWatch={onWatch} onExplore={()=>void navigate({to:"/tv"})}/>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {remainingGames.length>0&&(
                <section className="zf-football-other-section" aria-label="Outras partidas">
                  {liveGames.length>0&&<h3 className="zf-football-other-heading">Outras partidas do dia</h3>}
                  <div className="zf-football-guide-note"><FootballIcon size={17}/> {liveGames.length>0?"Demais confrontos organizados por relevância.":"Brasileirão Série A, Champions e confrontos relevantes em destaque."}</div>
                  <div className="zf-football-grid">
                    {remainingGames.map((game,index)=>(
                      <div key={game.id} className={"zf-football-match"+(index<4&&matchImportance(game)>=400?" is-featured":"")}>
                        <MatchCard game={game} onWatch={onWatch} onExplore={()=>void navigate({to:"/tv"})}/>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </section>
        <LeagueStandings compact={false} />
        <footer className="zf-football-footer"><Clock3 size={15}/> Horários no fuso de Brasília. Os botões de assistir aparecem apenas quando há identificação específica do canal brasileiro. Programação sujeita a alterações.</footer>
      </div>
    </main>
  );
}
