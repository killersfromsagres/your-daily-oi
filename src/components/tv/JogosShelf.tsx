"use client";
import { TelevisionIcon as Tv } from "@/components/icons/ContentIcons";

// src/components/tv/JogosShelf.tsx — React 19, Zang Live sports match center.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CompetitionIcon, FootballIcon } from "@/components/sports/FootballIcon";
import { LeagueStandings } from "@/components/sports/LeagueStandings";
import { MatchLineups } from "@/components/sports/MatchLineups";
import { StadiumIcon } from "@/components/sports/StadiumIcon";
import { FootballSceneHeader, selectedFootballLeague } from "@/components/sports/FootballSceneHeader";
import { featuredFootballMatches, mergeFootballScores, liveScoreLeagueIds, isBrazilFixture } from "@/lib/football-ranking";
import {
  Activity, AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock3, ExternalLink, MapPin, RefreshCw, ShieldQuestion, Trophy, WifiOff,
} from "lucide-react";
import { addDaysUTC, dataBrasilia, type JogoBrasileirao } from "@/lib/jogos-match";
import { getMatchCardVisual } from "@/lib/match-card-visual";
import { officialBroadcastTarget } from "@/lib/official-broadcast";
import { useMatchCardClock } from "@/lib/use-match-card-clock";
import "@/styles/jogos-center.css";
import "@/styles/sports-match-tickets.css";
import "@/styles/match-glass-premium.css";
import "@/styles/football-reference-scene.css";
import "@/styles/football-tv-remote.css";

interface JogosShelfProps {
  onSelectCanalId: (id: string) => void;
  onExploreChannels?: () => void;
  channelPlayback?: Record<string, "connecting" | "playing" | "unavailable">;
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
    <span className="zgame-crest zf-ticket-transparent-crest">
      {src && !bad ? (
        <img src={src} alt={"Escudo do " + name} loading="lazy" decoding="async" onError={() => setBad(true)} />
      ) : <span className="zgame-monogram" aria-label={"Escudo indisponível: " + name}>{initials || "FC"}</span>}
    </span>
  );
}
export function MatchCard({ game, onWatch, onExplore, channelPlayback }: {
  game: JogoBrasileirao;
  onWatch: (id: string) => void;
  onExplore?: (() => void) | undefined;
  channelPlayback?: Record<string, "connecting" | "playing" | "unavailable"> | undefined;
}) {
  const [channelsExpanded, setChannelsExpanded] = useState(false);
  const now = useMatchCardClock();
  const visual = getMatchCardVisual(game, now);
  const active = game.status === "ao-vivo";
  const watchable = Boolean(game.canalId);
  const officialTarget = officialBroadcastTarget(game.transmissaoUrl);
  const officialUrl = officialTarget?.href;
  const channelStatus = game.canalId ? channelPlayback?.[game.canalId] : undefined;
  const dateParts = game.dataLocal.split("-");
  const numberDay = dateParts[2] || "--";
  const monthAbbrev = new Intl.DateTimeFormat("pt-BR", { month:"short", timeZone:"UTC" })
    .format(new Date(game.dataLocal + "T12:00:00Z")).replace(".", "").toUpperCase();
  const theme = game.grupo === "copas" || game.grupo === "champions" ? "is-cup" : "is-league";
  const brazilFeatured = isBrazilFixture(game);
  const venue = game.estadio?.trim();

  return (
    <article className={"zgame-card zf-ticket zf-ticket-premium " + theme +
      (brazilFeatured ? " is-brazil" : "") +
      (active ? " is-live" : "") +
      (visual.phase === "soon" ? " is-soon" : "") +
      (watchable ? " has-channel" : "")}
      aria-label={game.casa + " contra " + game.fora + ". " + visual.statusLabel}>
      <button type="button" className="zf-ticket-main"
        disabled={!watchable && !officialUrl}
        onClick={() => {
          if (game.canalId) onWatch(game.canalId);
          else if (officialUrl) window.open(officialUrl, "_blank", "noopener,noreferrer");
        }}
        aria-label={watchable
          ? "Abrir " + game.canalNome + " para " + game.casa + " contra " + game.fora
          : officialUrl
            ? "Abrir " + officialTarget?.provider + " (requer assinatura) para " + game.casa + " contra " + game.fora
            : "Jogo " + game.casa + " contra " + game.fora + " — transmissão não confirmada"}>
        <div className="zf-ticket-masthead">
          <span className="zf-ticket-date" aria-label={"Dia " + numberDay + " de " + monthAbbrev}>
            <strong>{numberDay}</strong><small>{monthAbbrev}</small>
          </span>
          <span className="zf-ticket-league">
            <span className="zf-ticket-league-crest">
              {game.ligaLogo ? <img src={game.ligaLogo} alt="" loading="lazy"/> : <CompetitionIcon size={22}/>}
            </span>
            <strong title={game.liga}>{game.liga}</strong>
          </span>
        </div>
        <div className="zf-ticket-teams" aria-label={game.casa + " contra " + game.fora}>
          <div className="zf-ticket-team">
            <TeamCrest name={game.casa} src={game.escudoCasa}/>
            <strong title={game.casa}>{game.casa}</strong>
          </div>
          <span className="zf-ticket-vs" aria-hidden="true">×</span>
          <div className="zf-ticket-team">
            <TeamCrest name={game.fora} src={game.escudoFora}/>
            <strong title={game.fora}>{game.fora}</strong>
          </div>
        </div>
        <div className={"zf-ticket-status-row is-" + visual.phase}>
          <span className="zf-ticket-status">
            {visual.phase === "live" ? <span className="zf-ticket-live-dot" aria-hidden="true"/> :
             visual.phase === "soon" ? <Clock3 size={14}/> :
             visual.phase === "finished" ? <CheckCircle2 size={14}/> :
             <CalendarDays size={14}/>}
            {visual.statusLabel}
          </span>
        </div>
        {visual.showScore ? (
          <div className="zf-ticket-score-panel" aria-label={"Placar: " + visual.scoreHome + " a " + visual.scoreAway}>
            <span className="zf-ticket-score-pair">
              <strong>{visual.scoreHome}</strong><span aria-hidden="true">–</span><strong>{visual.scoreAway}</strong>
            </span>
            <span className="zf-ticket-score-phase">
              <small>{active ? (visual.periodLabel || "EM ANDAMENTO") : "RESULTADO"}</small>
              <strong>{active ? (game.minuto?.trim() || "AO VIVO") : "FINAL"}</strong>
            </span>
          </div>
        ) : active || visual.phase === "finished" ? (
          <div className="zf-ticket-score-panel is-unavailable">
            <span className="zf-ticket-score-empty">PLACAR NÃO INFORMADO</span>
            <span className="zf-ticket-score-phase">
              <small>{visual.periodLabel || (active ? "EM ANDAMENTO" : "RESULTADO")}</small>
              <strong>{active ? (game.minuto?.trim() || "AO VIVO") : "FINAL"}</strong>
            </span>
          </div>
        ) : (
          <div className="zf-ticket-time-block">
            <span className="zf-ticket-time-caption">HORÁRIO DE BRASÍLIA</span>
            <strong className="zf-ticket-time" suppressHydrationWarning>
              {visual.phase === "postponed" ? "—" : game.horarioLocal}
            </strong>
            {visual.remainingLabel && (
              <span className="zf-ticket-countdown" role="status">
                <Clock3 size={14}/>{visual.remainingLabel}
              </span>
            )}
          </div>
        )}
        <div className="zf-ticket-match-meta">
          <span className="zf-ticket-round" title={game.rodada || game.faseRotulo || game.liga}>
            {game.rodada || "PARTIDA"}
          </span>
          <span className="zf-ticket-stadium">
            <StadiumIcon size={27}/>
            <span><small>ESTÁDIO</small><strong>{venue || "Local a confirmar"}</strong></span>
            <MapPin size={17} aria-hidden="true" className="zf-ticket-stadium-pin"/>
          </span>
        </div>
      </button>
      <div className="zf-ticket-broadcast">
        {watchable && game.canalId && game.canalNome ? (
          <div className="zf-ticket-channel-panel">
            <button className={"zf-ticket-watch" +
              (visual.highlightWatch ? " is-ready" : "") +
              (active ? " is-onair" : "")}
              type="button" onClick={() => onWatch(game.canalId!)}>
              <Tv size={20} aria-hidden="true"/>
              <span><small>{channelStatus === "playing" ? "REPRODUÇÃO CONFIRMADA" :
                channelStatus === "unavailable" ? "FONTE FALHOU · TENTAR NOVAMENTE" :
                channelStatus === "connecting" ? "SINTONIZANDO CANAL…" :
                "CANAL CADASTRADO · NÃO VERIFICADO"}</small><strong>{game.canalNome}</strong></span>
              <ArrowRight size={18} aria-hidden="true"/>
            </button>
            {visual.highlightWatch && (
              <div className="zf-ticket-watch-ready"><span aria-hidden="true"/> ACENDE 5 MIN ANTES</div>
            )}
            {(game.canaisDisponiveis || []).filter(ch => ch.id !== game.canalId).length > 0 && (
              <button type="button" className="zf-ticket-channels-toggle"
                aria-expanded={channelsExpanded} onClick={() => setChannelsExpanded(value => !value)}>
                Outros canais <span>{(game.canaisDisponiveis?.length || 1) - 1}</span>
              </button>
            )}
            {channelsExpanded && (
              <div className="zf-ticket-channel-choices" aria-label="Outros canais confirmados para a partida">
                {(game.canaisDisponiveis || []).filter(ch => ch.id !== game.canalId).map(ch => (
                  <button key={ch.id} type="button" onClick={() => onWatch(ch.id)}
                    aria-label={"Assistir também em " + ch.nome}>
                    {ch.logo ? <img src={ch.logo} alt="" loading="lazy"/> : <Tv size={13}/>}
                    <span>{ch.nome}{channelPlayback?.[ch.id] === "unavailable" ? " · falhou na última tentativa" :
                      channelPlayback?.[ch.id] === "playing" ? " · reproduzindo" : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : officialUrl ? (
          <a className={"zf-ticket-watch zf-ticket-watch-external" +
            (visual.highlightWatch ? " is-ready" : "")}
            href={officialUrl} target="_blank" rel="noopener noreferrer"
            aria-label={"Abrir transmissão oficial de " + game.casa + " contra " + game.fora +
              " em " + officialTarget?.provider + " (requer assinatura)"}>
            <ExternalLink size={18}/>
            <span><small>TRANSMISSÃO OFICIAL · REQUER ASSINATURA</small>
              <strong>{game.canaisTransmissao?.[0] || officialTarget?.provider || "Serviço oficial"}</strong></span>
            <ArrowRight size={18}/>
          </a>
        ) : game.canaisTransmissao?.length ? (
          <div className="zf-ticket-identified"><Tv size={16}/>
            <span>TRANSMISSÃO INFORMADA · {game.canaisTransmissao.join(" · ")} · ainda sem canal vinculado</span>
          </div>
        ) : (
          <div className="zf-ticket-pending">
            <ShieldQuestion size={17}/>
            <span>Transmissão a confirmar</span>
            {onExplore && <button type="button" onClick={onExplore}>Ver canais <ArrowRight size={14}/></button>}
          </div>
        )}
      </div>
      <MatchLineups game={game}/>
    </article>
  );
}

export function JogosShelf({ onSelectCanalId, onExploreChannels, channelPlayback }: JogosShelfProps) {
  const [leagueFilter,setLeagueFilter] = useState("auto");
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
  const selectedLeague = selectedFootballLeague(allGames,leagueFilter);
  const filtered = useMemo(() => featuredFootballMatches(
    selectedLeague==="all" ? allGames : allGames.filter(game=>game.ligaId===selectedLeague),8),
    [allGames,selectedLeague]);

  const live = allGames.filter(game=>game.status==="ao-vivo").length;
  const linked = allGames.filter(game=>game.canalId||game.transmissaoUrl).length;
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
    <section className="zgame-center is-compact zf-reference-section" id="ztv-jogos"
      aria-label="Jogos de Hoje — futebol ao vivo">
      <div className="zgame-ambient" aria-hidden="true" />
      <div className="zf-reference-scene">
        <FootballSceneHeader games={allGames} selection={selectedLeague}
          onChange={setLeagueFilter}
          title={day===today?"Jogos de Hoje":"Jogos do Dia"}/>
        {pending ? (
          <div className="zgame-grid" aria-busy="true">
            {[1,2,3,4].map(i=><div key={i} className="zgame-skeleton" aria-hidden="true"><span/><div/><span/></div>)}
          </div>
        ) : failure || data?.erro ? (
          <div className="zgame-empty" role="alert">
            <WifiOff size={26}/>
            <h4>Agenda temporariamente indisponível</h4>
            <p>{failure || data?.erro}</p>
            <button type="button" onClick={()=>setRefreshKey(k=>k+1)}>
              Tentar novamente <RefreshCw size={15}/>
            </button>
          </div>
        ) : filtered.length ? (
          <div className="zgame-grid zf-reference-cards">
            {filtered.map(game => <MatchCard key={game.id} game={game}
              onWatch={selectChannel} onExplore={onExploreChannels} channelPlayback={channelPlayback}/>)}
          </div>
        ) : (
          <div className="zgame-empty">
            <CalendarDays size={28}/>
            <h4>{allGames.length?"Nenhum jogo desta competição na data selecionada":"Sem partidas registradas para esta data"}</h4>
            <p>Selecione outra competição ou uma data diferente para consultar os jogos reais disponíveis.</p>
            {allGames.length ? (
              <button type="button" onClick={()=>setLeagueFilter("all")}>Ver todas as competições <ArrowRight size={15}/></button>
            ) : day!==days[6] ? (
              <button type="button" onClick={()=>jumpDays(1)}>Ver próximo dia <ArrowRight size={15}/></button>
            ) : null}
          </div>
        )}
        {data?.parcial && !pending && (
          <p className="zgame-partial" role="status">
            <AlertTriangle size={18} aria-hidden="true"/>
            Algumas competições não responderam. Exibindo a programação confirmada.
          </p>
        )}
        <div className="zf-reference-scene-footer">
          {live>0 && <span className="zgame-live-flag"><span/> {live} EM ANDAMENTO</span>}
          <span className="zgame-timezone"><Clock3 size={14}/> Horário de Brasília</span>
          <Link to="/futebol" className="zf-football-inline-link">
            <FootballIcon size={16}/> Central completa de futebol <ArrowRight size={15}/>
          </Link>
          <button type="button" className="zgame-refresh" aria-label="Atualizar agenda"
            onClick={()=>setRefreshKey(k=>k+1)} disabled={pending}>
            <RefreshCw size={15} className={pending?"zgame-spin":""}/> Atualizar
          </button>
        </div>
      </div>
      <details className="zf-reference-calendar">
        <summary><CalendarDays size={17}/> Outras datas e programação <ChevronDown size={17}/></summary>
        <div className="zf-reference-calendar-body">
          <div className="zgame-toolbar">
            <div className="zgame-toolbar-label"><CalendarDays size={18}/><span>Selecione o dia</span></div>
            <div className="zgame-days">
              <button className="zgame-day-arrow" type="button" onClick={()=>jumpDays(-1)}
                disabled={day===days[0]} aria-label="Dia anterior"><ChevronLeft size={18}/></button>
              <div className="zgame-days-scroll">
                {days.map((d,i)=>(
                  <button key={d} type="button" className={"zgame-day"+(day===d?" is-active":"")}
                    onClick={()=>{setDay(d);setLeagueFilter("auto");}} aria-pressed={day===d}>
                    <span>{i===0?"HOJE":i===1?"AMANHÃ":
                      new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",weekday:"short"}).format(shortDate(d)).replace(".","").toUpperCase()}</span>
                    <strong>{new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",day:"2-digit"}).format(shortDate(d))}</strong>
                    <small>{new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",month:"short"}).format(shortDate(d)).replace(".","")}</small>
                  </button>
                ))}
              </div>
              <button className="zgame-day-arrow" type="button" onClick={()=>jumpDays(1)}
                disabled={day===days[6]} aria-label="Próximo dia"><ChevronRight size={18}/></button>
            </div>
          </div>
          <div className="zgame-section-head">
            <div>
              <span className="zgame-section-kicker">{day===today?"PROGRAMAÇÃO DE HOJE":"AGENDA DO DIA"}</span>
              <h3>{longDay.format(shortDate(day))}</h3>
            </div>
            <div className="zgame-summary">
              <span><Trophy size={14}/> {allGames.length} {allGames.length===1?"jogo":"jogos"}</span>
              {linked>0 && <span><CheckCircle2 size={14}/> {linked} {linked===1?"canal identificado":"canais identificados"}</span>}
            </div>
          </div>
          <div className="zf-featured-summary">
            <span><FootballIcon size={16}/> Confrontos organizados por relevância</span>
            <Link to="/futebol" className="zf-football-view-all">
              Ver todos os {allGames.length} jogos <ArrowRight size={15}/>
            </Link>
          </div>
        </div>
      </details>
    </section>
  );
}
