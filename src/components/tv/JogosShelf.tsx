"use client";
import { TelevisionIcon as Tv } from "@/components/icons/ContentIcons";

// src/components/tv/JogosShelf.tsx — React 19, Zang Live sports match center.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CompetitionIcon, FootballIcon } from "@/components/sports/FootballIcon";
import { LeagueStandings } from "@/components/sports/LeagueStandings";
import { MatchLineups } from "@/components/sports/MatchLineups";
import { featuredFootballMatches, mergeFootballScores, liveScoreLeagueIds, isBrazilFixture } from "@/lib/football-ranking";
import {
  Activity, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, MapPin, Radio, RefreshCw, ShieldQuestion, Trophy, WifiOff,
} from "lucide-react";
import { addDaysUTC, dataBrasilia, type JogoBrasileirao } from "@/lib/jogos-match";
import "@/styles/jogos-center.css";
import "@/styles/sports-match-tickets.css";

interface JogosShelfProps {
  onSelectCanalId: (id: string) => void;
  onExploreChannels?: () => void;
}

interface SportsApiResponse {
  atualizadoEm: string;
  dataLocal: string;
  jogos: JogoBrasileirao[];
  parcial?: boolean;
  fontesConsultadas?: number;
  ligasIndisponiveis?: string[];
  erro?: string;
}

const humanDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortDate = (date: string): Date => new Date(date + "T12:00:00Z");
const dateLabel = (date: string) => humanDay.format(shortDate(date)).replace(/\.$/, "");

function TeamCrest({ src, name }: { src?: string | undefined; name: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase().slice(0, 3);
  return (
    <span className="zgame-crest">
      {src && !bad ? (
        <img src={src} alt={"Escudo do " + name} loading="lazy" decoding="async" onError={() => setBad(true)} />
      ) : <span className="zgame-monogram" aria-label={"Escudo indisponível: " + name}>{initials || "FC"}</span>}
    </span>
  );
}
export function MatchCard({ game, onWatch, onExplore }: {
  game: JogoBrasileirao;
  onWatch: (id: string) => void;
  onExplore?: (() => void) | undefined;
}) {
  const active=game.status==="ao-vivo";
  const watchable=Boolean(game.canalId);
  const scored=game.placarCasa!==null&&game.placarFora!==null;
  const dateParts=game.dataLocal.split("-");
  const numberDay=dateParts[2]||"--";
  const monthAbbrev=new Intl.DateTimeFormat("pt-BR",{month:"short",timeZone:"UTC"})
    .format(new Date(game.dataLocal+"T12:00:00Z")).replace(".","").toUpperCase();
  const statusLabel=active?(game.fase==="intervalo"?"INTERVALO":game.faseRotulo||"AO VIVO"):
    game.status==="encerrado"?"ENCERRADO":
    game.status==="adiado"?"ADIADO":"EM BREVE";
  const displayTime=active&&scored
    ?game.placarCasa+" – "+game.placarFora
    :game.status==="adiado"?"ADIADO":game.horarioLocal;
  const theme=game.grupo==="copas"||game.grupo==="champions"?"is-cup":"is-league";
  const brazilFeatured=isBrazilFixture(game);
  const venue=game.estadio?.trim();
  return (
    <article className={"zgame-card zf-ticket "+theme+(brazilFeatured?" is-brazil":"")+(active?" is-live":"")+(watchable?" has-channel":"")}>
      <div className="zf-ticket-watermark" aria-hidden="true">ZANG <span>FLIX</span></div>
      <button
        type="button" className="zf-ticket-main"
        disabled={!watchable}
        onClick={()=>{if(game.canalId)onWatch(game.canalId);}}
        aria-label={watchable
          ?"Assistir "+game.casa+" contra "+game.fora+" no canal "+game.canalNome
          :"Jogo "+game.casa+" contra "+game.fora+" — transmissão não confirmada"}
      >
        <div className="zf-ticket-masthead">
          <span className="zf-ticket-date"><strong>{numberDay}</strong><small>{monthAbbrev}</small></span>
          <span className="zf-ticket-league">
            <span className="zf-ticket-league-crest">{game.ligaLogo?<img src={game.ligaLogo} alt="" loading="lazy"/>:<CompetitionIcon size={22}/>}</span>
            <strong title={game.liga}>{game.liga}</strong>
          </span>
          <span className={"zf-ticket-status"+(active?" is-live":"")}>{active&&<Radio size={11}/>} {statusLabel}</span>
        </div>
        <div className="zf-ticket-teams" aria-label={game.casa+" contra "+game.fora}>
          <div className="zf-ticket-team"><TeamCrest name={game.casa} src={game.escudoCasa}/>
            <strong title={game.casa}>{game.casa}</strong>
          </div>
          <span className="zf-ticket-vs">×</span>
          <div className="zf-ticket-team"><TeamCrest name={game.fora} src={game.escudoFora}/>
            <strong title={game.fora}>{game.fora}</strong>
          </div>
        </div>
        <div className="zf-ticket-time-block">
          <span className="zf-ticket-time-caption">{active?"PLACAR AO VIVO":"HORÁRIO DE BRASÍLIA"}</span>
          <strong className="zf-ticket-time">{displayTime}</strong>
          {active&&game.minuto&&<small className="zf-ticket-minute">{game.minuto}</small>}
        </div>
        <div className="zf-ticket-match-meta">
          <span className="zf-ticket-round" title={game.rodada||game.faseRotulo||game.liga}>
            {game.rodada||game.faseRotulo||"PARTIDA"}
          </span>
          {venue&&<span className="zf-ticket-stadium"><MapPin size={12}/> {venue}</span>}
        </div>
      </button>
      <div className="zf-ticket-broadcast">
        {watchable&&game.canalId&&game.canalNome?(
          <div className="zf-ticket-channel-panel">
            <button className="zf-ticket-watch" type="button" onClick={()=>onWatch(game.canalId!)}>
              <Tv size={16}/>
              <span><small>ASSISTIR NO CANAL</small><strong>{game.canalNome}</strong></span>
              <ArrowRight size={16}/>
            </button>
            {(game.canaisDisponiveis||[]).filter(ch=>ch.id!==game.canalId).length>0&&
              <div className="zf-ticket-channel-choices" aria-label="Outros canais confirmados para a partida">
                {(game.canaisDisponiveis||[]).filter(ch=>ch.id!==game.canalId).map(ch=>
                  <button key={ch.id} type="button" onClick={()=>onWatch(ch.id)}
                    aria-label={"Assistir também em "+ch.nome}>
                    {ch.logo?<img src={ch.logo} alt="" loading="lazy"/>:<Tv size={12}/>}
                    <span>{ch.nome}</span>
                  </button>)}
              </div>}
          </div>
        ):game.canaisTransmissao?.length?(
          <div className="zf-ticket-identified"><Tv size={15}/>
            <span>TRANSMISSÃO INFORMADA · {game.canaisTransmissao.join(" · ")} · canais não vinculados ao catálogo</span>
          </div>
        ):(
          <div className="zf-ticket-pending">
            <ShieldQuestion size={15}/>
            <span>Transmissão a confirmar</span>
            {onExplore&&<button type="button" onClick={onExplore}>Canais <ArrowRight size={13}/></button>}
          </div>
        )}
      </div>
      <MatchLineups game={game}/>
    </article>
  );
}

export function JogosShelf({ onSelectCanalId, onExploreChannels }: JogosShelfProps) {
  const [today, setToday] = useState(() => dataBrasilia(new Date()));
  const [day, setDay] = useState(() => dataBrasilia(new Date()));

  const [data, setData] = useState<SportsApiResponse | null>(null);
  const [pending, setPending] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scoreRefresh, setScoreRefresh] = useState(0);
  const [scores, setScores] = useState<SportsApiResponse | null>(null);
  const previousRequest = useRef<AbortController | null>(null);
  const days = useMemo(() => Array.from({length:7}, (_,i) => addDaysUTC(today,i)), [today]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = dataBrasilia(new Date());
      if (current !== today) {
        setToday(current);
        setDay(current);
        setRefreshKey(k => k + 1);
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [today]);

  useEffect(() => {
    const controller = new AbortController();
    previousRequest.current?.abort();
    previousRequest.current = controller;
    // Keep the current game cards visible during background score refreshes.
    if (data?.dataLocal !== day) setPending(true);
    setFailure(null);
    // Cache-busting not required: the server returns at most 2-minute-old fixtures.
    fetch("/api/jogos-agenda?data=" + encodeURIComponent(day), {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const json = await response.json() as SportsApiResponse;
      if (!response.ok) throw new Error(json.erro || "Falha ao consultar a programação");
      return json;
    }).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setFailure(error instanceof Error ? error.message : "Falha ao obter jogos");
      setData(null);
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false);
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") setRefreshKey(k => k + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => setRefreshKey(k => k + 1), 2 * 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [day, refreshKey]);

  const baseGames=useMemo(()=>data?.dataLocal===day?data.jogos:[],[data,day]);
  const leagueIds=useMemo(()=>liveScoreLeagueIds(baseGames,Date.now()),[baseGames,scoreRefresh]);
  const leagueParam=leagueIds.join(",");
  useEffect(()=>{
    if(day!==today || data?.dataLocal!==day)return;
    const controller=new AbortController();
    const params=new URLSearchParams({data:day});
    if(leagueParam)params.set("ligas",leagueParam);
    fetch("/api/jogos-placares?"+params.toString(),{cache:"no-store",signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw new Error("Placar indisponível");
        const value=await response.json() as SportsApiResponse;
        if(value.dataLocal!==day||!Array.isArray(value.jogos))throw new Error("Placar inválido");
        return value;
      })
      .then(value=>{if(!controller.signal.aborted)setScores(value);})
      .catch(()=>{/* Keep the complete agenda if the scoreboard source is down. */});
    return ()=>controller.abort();
  },[data,day,today,scoreRefresh,leagueParam]);

  useEffect(()=>{
    if(day!==today || !baseGames.length)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState==="visible")setScoreRefresh(x=>x+1);
    },leagueParam?30_000:75_000);
    return ()=>window.clearInterval(timer);
  },[day,today,baseGames.length,leagueParam]);

  const allGames=useMemo(()=>{
    const updates=scores?.dataLocal===day &&
      (!data?.atualizadoEm || Date.parse(scores.atualizadoEm)>=Date.parse(data.atualizadoEm))
      ? scores.jogos : [];
    return mergeFootballScores(baseGames,updates,day);
  },[baseGames,scores,data,day]);
  const filtered = useMemo(() => featuredFootballMatches(allGames, 8), [allGames]);

  const live = allGames.filter(game=>game.status==="ao-vivo").length;
  const linked = allGames.filter(game=>game.canalId).length;
  const selectChannel = useCallback((id: string) => {
    onSelectCanalId(id);
    // Player is rendered above this match center in Zang Live.
    window.setTimeout(() => document.querySelector(".ztv-featured")?.scrollIntoView({ behavior:"smooth", block:"center" }), 100);
  }, [onSelectCanalId]);

  const jumpDays = (offset: number) => {
    const current = days.indexOf(day);
    const next = Math.min(6, Math.max(0,current + offset));
    const selected = days[next];
    if (selected) setDay(selected);
  };

  return (
    <section className="zgame-center" id="ztv-jogos" aria-label="Central de futebol com jogos do dia">
      <div className="zgame-ambient" aria-hidden="true" />
      <header className="zgame-header">
        <div className="zgame-header-copy">
          <div className="zgame-kicker"><Activity size={14} /><span>AGENDA ESPORTIVA</span><span className="zgame-kicker-line" /><span>FUTEBOL AO VIVO</span></div>
          <h2>Hoje tem <em>jogo.</em></h2>
          <Link to="/futebol" className="zf-football-inline-link"><FootballIcon size={16}/> Central completa de futebol <ArrowRight size={14}/></Link>
          <p>Jogos, placares e onde assistir. Brasileirão Série A em destaque, com atualização automática da agenda.</p>
        </div>
        <div className="zgame-header-actions">
          {live > 0 && <span className="zgame-live-flag"><span /> {live} EM ANDAMENTO</span>}
          <span className="zgame-timezone"><Clock3 size={15} /> Horário de Brasília</span>
          <button type="button" className="zgame-refresh" aria-label="Atualizar agenda" onClick={() => setRefreshKey(k => k + 1)} disabled={pending}>
            <RefreshCw size={16} className={pending ? "zgame-spin" : ""} /> Atualizar
          </button>
        </div>
      </header>

      <div className="zgame-toolbar">
        <div className="zgame-toolbar-label"><CalendarDays size={18} /><span>Selecione o dia</span></div>
        <div className="zgame-days">
          <button className="zgame-day-arrow" type="button" onClick={() => jumpDays(-1)} disabled={day === days[0]} aria-label="Dia anterior"><ChevronLeft size={18} /></button>
          <div className="zgame-days-scroll">
            {days.map((d,i) => (
              <button key={d} type="button" className={"zgame-day" + (day === d ? " is-active" : "")}
                onClick={() => setDay(d)} aria-pressed={day === d}>
                <span>{i===0 ? "HOJE" : i===1 ? "AMANHÃ" : new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short"}).format(shortDate(d)).replace(".","").toUpperCase()}</span>
                <strong>{new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",day:"2-digit"}).format(shortDate(d))}</strong>
                <small>{new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",month:"short"}).format(shortDate(d)).replace(".","")}</small>
              </button>
            ))}
          </div>
          <button className="zgame-day-arrow" type="button" onClick={() => jumpDays(1)} disabled={day === days[6]} aria-label="Próximo dia"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="zgame-section-head">
        <div>
          <span className="zgame-section-kicker">{day === today ? "PROGRAMAÇÃO DE HOJE" : "AGENDA DO DIA"}</span>
          <h3>{longDay.format(shortDate(day))}</h3>
        </div>
        <div className="zgame-summary">
          <span><Trophy size={14} /> {allGames.length} {allGames.length === 1 ? "jogo" : "jogos"}</span>
          {linked > 0 && <span><CheckCircle2 size={14} /> {linked} {linked === 1 ? "canal identificado" : "canais identificados"}</span>}
        </div>
      </div>

      <div className="zf-featured-summary">
        <span><FootballIcon size={16} /> Só os confrontos mais relevantes</span>
        <Link to="/futebol" className="zf-football-view-all">
          Ver todos os {allGames.length} jogos <ArrowRight size={15} />
        </Link>
      </div>

      {data?.parcial && !pending && (
        <p className="zgame-partial" role="status">Algumas ligas não responderam nesta atualização. A agenda pode estar incompleta.</p>
      )}
      {pending ? (
        <div className="zgame-grid" aria-busy="true">
          {[1,2,3,4].map(i=><div key={i} className="zgame-skeleton" aria-hidden="true"><span/><div/><span/></div>)}
        </div>
      ) : failure || data?.erro ? (
        <div className="zgame-empty" role="alert">
          <WifiOff size={26} />
          <h4>Agenda temporariamente indisponível</h4>
          <p>{failure || data?.erro}</p>
          <button type="button" onClick={() => setRefreshKey(k => k + 1)}>Tentar novamente <RefreshCw size={15} /></button>
        </div>
      ) : filtered.length ? (
        <div className="zgame-grid">
          {filtered.map(game => <MatchCard key={game.id} game={game} onWatch={selectChannel} onExplore={onExploreChannels} />)}
        </div>
      ) : (
        <div className="zgame-empty">
          <CalendarDays size={28} />
          <h4>{allGames.length ? "Sem jogos de destaque nesta data" : "Sem partidas registradas para esta data"}</h4>
          <p>{allGames.length
            ? "Existem outros confrontos. Veja a agenda completa para consultar todos os jogos deste dia."
            : "Os jogos são atualizados automaticamente pela fonte de resultados. Selecione outro dia para consultar a próxima rodada."}</p>
          {allGames.length ? (
            <Link to="/futebol" className="zf-football-view-all">Abrir agenda completa <ArrowRight size={15}/></Link>
          ) : day !== days[6] ? (
            <button type="button" onClick={() => jumpDays(1)}>Ver próximo dia <ArrowRight size={15}/></button>
          ) : null}
        </div>
      )}
      <div className="zgame-standings-entry"><LeagueStandings /></div>
      <footer className="zgame-footer">
        <span><RefreshCw size={15} /> Datas e placares de fonte esportiva; atualizações automáticas.</span>
        <span>Os canais são vinculados apenas quando a transmissão específica é identificada. A disponibilidade pode variar.</span>
      </footer>
    </section>
  );
}
