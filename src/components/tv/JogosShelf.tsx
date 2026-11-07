"use client";

// src/components/tv/JogosShelf.tsx — React 19, Zang Live sports match center.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CompetitionIcon, FootballIcon } from "@/components/sports/FootballIcon";
import { featuredFootballMatches } from "@/lib/football-ranking";
import {
  Activity, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, Radio, RefreshCw, ShieldQuestion, Sparkles, Trophy, Tv, WifiOff,
} from "lucide-react";
import { addDaysUTC, dataBrasilia, type JogoBrasileirao } from "@/lib/jogos-match";
import "@/styles/jogos-center.css";

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
  const active = game.status === "ao-vivo";
  const hasScore = game.placarCasa !== null && game.placarFora !== null;
  const watchable = Boolean(game.canalId);
  const time = game.status === "encerrado" ? "ENCERRADO" :
    game.status === "adiado" ? "ADIADO" : active ? "AO VIVO" : game.horarioLocal;
  return (
    <article className={"zgame-card" + (active ? " is-live" : "") + (watchable ? " has-channel" : "")}>
      <button
        type="button"
        className="zgame-card-main"
        disabled={!watchable}
        onClick={() => { if (game.canalId) onWatch(game.canalId); }}
        aria-label={watchable
          ? "Assistir " + game.casa + " contra " + game.fora + " no canal " + game.canalNome
          : "Transmissão ainda não confirmada"}
      >
      <div className="zgame-card-header">
        <span className="zgame-league">
          <span className="zgame-league-emblem">
            {game.ligaLogo ? <img src={game.ligaLogo} alt="" loading="lazy" /> : <CompetitionIcon size={19} />}
          </span>
          {game.liga}
        </span>
        <span className={"zgame-kickoff" + (active ? " is-live" : "")}>
          {active ? <Radio size={12} /> : <Clock3 size={12} />} {time}
        </span>
      </div>
      {game.rodada && <span className="zgame-round">{game.rodada}</span>}
      <div className="zgame-versus" aria-label={game.casa + " contra " + game.fora}>
        <div className="zgame-team">
          <TeamCrest src={game.escudoCasa} name={game.casa} />
          <strong title={game.casa}>{game.casa}</strong>
        </div>
        <div className="zgame-score">
          {hasScore ? (
            <span className="zgame-score-numbers">{game.placarCasa}<small>:</small>{game.placarFora}</span>
          ) : (
            <span className="zgame-score-vs">X</span>
          )}
          <small>{hasScore ? (active ? "EM JOGO" : "PLACAR") : "VS"}</small>
        </div>
        <div className="zgame-team">
          <TeamCrest src={game.escudoFora} name={game.fora} />
          <strong title={game.fora}>{game.fora}</strong>
        </div>
      </div>
      </button>
      <div className="zgame-card-footer">
        {watchable && game.canalId && game.canalNome ? (
          <button className="zgame-watch" type="button" onClick={() => onWatch(game.canalId!)}>
            <span className="zgame-watch-icon">{game.canalLogo
              ? <img src={game.canalLogo} alt="" loading="lazy" />
              : <Tv size={17} />}</span>
            <span><small>TRANSMISSÃO IDENTIFICADA</small><strong>{game.canalNome}</strong></span>
            <ArrowRight size={18} className="zgame-watch-arrow" />
          </button>
        ) : (
          <div className="zgame-unconfirmed">
            <span><ShieldQuestion size={17} /> Transmissão no Brasil não confirmada</span>
            {onExplore && (
              <button type="button" onClick={onExplore} title="Explorar canais esportivos disponíveis">
                Explorar canais <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>
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

  const allGames = data?.dataLocal === day ? data.jogos : [];
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
          <p>Brasileirão, Champions League e grandes campeonatos. Acompanhe os confrontos no horário de Brasília.</p>
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
      <footer className="zgame-footer">
        <span><Sparkles size={15} /> Datas e placares de fonte esportiva; atualizações automáticas.</span>
        <span>Os canais são vinculados apenas quando a transmissão específica é identificada. A disponibilidade pode variar.</span>
      </footer>
    </section>
  );
}
