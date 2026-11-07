"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Clock3,
  Grid2X2, Heart, List, Radio, RefreshCw, Search, Signal,
  Star, Tv2, WifiOff, X,
} from "lucide-react";
import { type CanalTV, fetchCanaisFallbackClient } from "@/lib/canais";
import type { CanalEPG, ProgramaEPG } from "@/lib/epg";
import { LivePlayer } from "@/components/player/LivePlayer";
import { JogosShelf } from "@/components/tv/JogosShelf";

const FAVORITES_KEY = "zangflix:tv-favorites";
const RECENTS_KEY = "zangflix:tv-recents-v1";
const LAST_KEY = "zangflix:tv-last-channel";
const REFRESH_INTERVAL_MS = 9 * 60 * 1000;

interface TvViewProps { initialCanalId?: string; }
interface CatalogResponse {
  canais: CanalTV[];
  categorias: string[];
  atualizadoEm?: string;
}
interface EpgSlot { atual: ProgramaEPG | null; proximo: ProgramaEPG | null; }

function readStoredArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 100)
      : [];
  } catch { return []; }
}
function storeArray(key: string, values: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(values)); } catch { /* private mode */ }
}
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function sameChannels(a: CanalTV[], b: CanalTV[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const other = b[i];
    return other?.id === c.id && other.nome === c.nome &&
      other.logo === c.logo && other.categoria === c.categoria &&
      c.fontes.length === other.fontes.length &&
      c.fontes.every((source, j) => {
        const alt = other.fontes[j];
        return alt?.url === source.url && alt.referer === source.referer &&
          alt.agente === source.agente && alt.chave === source.chave;
      });
  });
}
async function getCatalog(signal: AbortSignal): Promise<CatalogResponse> {
  try {
    const response = await fetch("/api/canais", { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Catálogo HTTP " + response.status);
    const data = await response.json() as CatalogResponse;
    if (!Array.isArray(data.canais) || !data.canais.length) throw new Error("Catálogo vazio");
    return data;
  } catch (error) {
    if (signal.aborted) throw error;
    // A origem pode continuar acessível no navegador quando o Worker estiver instável.
    const fallback = await fetchCanaisFallbackClient();
    if (!fallback.canais.length) throw error;
    return fallback;
  }
}

function ChannelLogo({ channel, small = false }: { channel: CanalTV; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [channel.logo]);
  const initials = channel.nome.trim().slice(0, small ? 2 : 3).toUpperCase();
  return (
    <span className={"ztv-logo" + (small ? " ztv-logo-small" : "")}>
      {channel.logo && !failed && /^https?:\/\//i.test(channel.logo) ? (
        <img src={channel.logo} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials || "TV"}</span>
      )}
    </span>
  );
}
function ChannelCard({
  channel, active, favorite, onSelect, onFavorite, listMode,
}: {
  channel: CanalTV; active: boolean; favorite: boolean;
  onSelect: () => void; onFavorite: () => void; listMode: boolean;
}) {
  const available = channel.fontes.length > 0;
  return (
    <article className={"ztv-card" + (active ? " is-active" : "") +
      (!available ? " is-unavailable" : "") + (listMode ? " is-list" : "")}>
      <button
        className="ztv-card-main" type="button" onClick={onSelect}
        aria-label={"Assistir " + channel.nome + (available ? "" : " — sem fontes")}
        aria-current={active ? "true" : undefined}
      >
        <ChannelLogo channel={channel} />
        <span className="ztv-card-body">
          <strong title={channel.nome}>{channel.nome}</strong>
          <span className="ztv-card-category">{channel.categoria}</span>
          <span className="ztv-card-meta">
            <span className={"ztv-status-dot" + (available ? " is-on" : " is-off")} />
            {available ? channel.fontes.length + (channel.fontes.length === 1 ? " fonte" : " fontes") : "Sem fonte"}
          </span>
        </span>
        {active && <span className="ztv-card-playing">Assistindo</span>}
      </button>
      <button
        type="button" className={"ztv-card-star" + (favorite ? " is-favorite" : "")}
        onClick={onFavorite} aria-label={(favorite ? "Remover " : "Favoritar ") + channel.nome}
        title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      >
        <Star size={16} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

export function TvView({ initialCanalId }: TvViewProps) {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<CanalTV[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeId, setActiveId] = useState(initialCanalId || "");
  const [favorites, setFavorites] = useState<string[]>(() => readStoredArray(FAVORITES_KEY));
  const [recents, setRecents] = useState<string[]>(() => readStoredArray(RECENTS_KEY));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [visible, setVisible] = useState(48);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideQuery, setGuideQuery] = useState("");
  const [guide, setGuide] = useState<Record<string, EpgSlot>>({});
  const [guideLoading, setGuideLoading] = useState(false);
  const [activeEpg, setActiveEpg] = useState<CanalEPG | null>(null);

  const lastRefresh = useRef(0);
  const initialChannelRef = useRef(initialCanalId);
  initialChannelRef.current = initialCanalId;
  const requestRef = useRef<AbortController | null>(null);
  const refreshPending = useRef(false);
  const guideLastLoad = useRef(0);
  const loaderRef = useRef<HTMLDivElement>(null);

  const applyCatalog = useCallback((data: CatalogResponse) => {
    setChannels(previous => sameChannels(previous, data.canais) ? previous : data.canais);
    setCategories(data.categorias || []);
    setUpdatedAt(data.atualizadoEm || new Date().toISOString());
    setCatalogError(null);
    setActiveId(previous => {
      const requested = initialChannelRef.current;
      if (requested && data.canais.some(c => c.id === requested)) return requested;
      if (previous && data.canais.some(c => c.id === previous)) return previous;
      let saved = "";
      try { saved = localStorage.getItem(LAST_KEY) || ""; } catch {}
      if (saved && data.canais.some(c => c.id === saved)) return saved;
      const first = data.canais.find(c => c.fontes.length && /^(band|sbt)$/i.test(c.nome)) ||
        data.canais.find(c => c.fontes.length) || data.canais[0];
      return first?.id || "";
    });
  }, []);

  const refresh = useCallback(async (initial = false) => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await getCatalog(controller.signal);
      applyCatalog(data);
      lastRefresh.current = Date.now();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível buscar os canais";
      setCatalogError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshPending.current = false;
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [applyCatalog]);

  useEffect(() => {
    void refresh(true);
    return () => { requestRef.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh.current > REFRESH_INTERVAL_MS) {
        void refresh();
      }
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);

  useEffect(() => {
    if (initialCanalId) setActiveId(initialCanalId);
  }, [initialCanalId]);

  const active = useMemo(() =>
    channels.find(c => c.id === activeId) ||
    channels.find(c => c.fontes.length > 0) || channels[0] || null,
    [channels, activeId]);

  const selectChannel = useCallback((channel: CanalTV) => {
    setActiveId(channel.id);
    setPlayerLoading(true);
    setRecents(previous => {
      const next = [channel.id, ...previous.filter(id => id !== channel.id)].slice(0, 18);
      storeArray(RECENTS_KEY, next);
      return next;
    });
    try { localStorage.setItem(LAST_KEY, channel.id); } catch {}
    void navigate({ to: "/tv/canal/$id", params: { id: channel.id }, replace: true });
  }, [navigate]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(previous => {
      const next = previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id];
      storeArray(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const activeIndex = channels.findIndex(c => c.id === active?.id);
  const switchChannel = useCallback((direction: number) => {
    if (!channels.length) return;
    const playable = channels.filter(c => c.fontes.length > 0);
    if (!playable.length) return;
    const index = playable.findIndex(c => c.id === active?.id);
    const next = playable[(index + direction + playable.length) % playable.length] || playable[0];
    if (next) selectChannel(next);
  }, [channels, active?.id, selectChannel]);

  useEffect(() => {
    if (!active?.nome) return;
    let alive = true;
    setActiveEpg(null);
    fetch("/api/epg?canal=" + encodeURIComponent(active.nome))
      .then(r => r.ok ? r.json() : null)
      .then((item: CanalEPG | null) => { if (alive) setActiveEpg(item); })
      .catch(() => {});
    return () => { alive = false; };
  }, [active?.nome]);

  useEffect(() => {
    if (!guideOpen || Date.now() - guideLastLoad.current < 5 * 60_000) return;
    let alive = true;
    setGuideLoading(true);
    fetch("/api/epg/agora", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("EPG HTTP " + r.status); return r.json(); })
      .then((entries: Array<{ canalNome: string; atual: ProgramaEPG | null; proximo: ProgramaEPG | null }>) => {
        if (!alive || !Array.isArray(entries)) return;
        const data: Record<string, EpgSlot> = {};
        for (const item of entries) data[item.canalNome] = { atual: item.atual, proximo: item.proximo };
        setGuide(data);
        guideLastLoad.current = Date.now();
      })
      .catch(() => {})
      .finally(() => { if (alive) setGuideLoading(false); });
    return () => { alive = false; };
  }, [guideOpen]);

  useEffect(() => {
    if (!guideOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuideOpen(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [guideOpen]);

  const availableCount = useMemo(() => channels.filter(c => c.fontes.length > 0).length, [channels]);
  const sourceCount = useMemo(() => channels.reduce((sum, c) => sum + c.fontes.length, 0), [channels]);

  const filtered = useMemo(() => {
    const search = normalize(query);
    let items = channels.filter(c => {
      if (onlineOnly && c.fontes.length === 0) return false;
      if (category === "Favoritos" && !favorites.includes(c.id)) return false;
      if (category === "Recentes" && !recents.includes(c.id)) return false;
      if (category !== "Todos" && category !== "Favoritos" && category !== "Recentes" && c.categoria !== category) return false;
      return !search || normalize(c.nome + " " + c.categoria).includes(search);
    });
    if (category === "Recentes") {
      items = [...items].sort((a, b) => recents.indexOf(a.id) - recents.indexOf(b.id));
    } else {
      items = [...items].sort((a, b) => Number(b.fontes.length > 0) - Number(a.fontes.length > 0) ||
        a.nome.localeCompare(b.nome, "pt-BR"));
    }
    return items;
  }, [channels, query, category, favorites, recents, onlineOnly]);

  useEffect(() => setVisible(48), [query, category, onlineOnly, layout]);
  useEffect(() => {
    const node = loaderRef.current;
    if (!node || filtered.length <= visible) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setVisible(n => Math.min(n + 36, filtered.length));
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length, visible]);

  const quickChannels = useMemo(() => {
    const fav = channels.filter(c => c.fontes.length && favorites.includes(c.id));
    const highlighted = channels.filter(c => c.fontes.length &&
      /^(band|sbt|record|globo|cnn|espn|sportv|tv cultura)/i.test(c.nome));
    const result = [...fav, ...highlighted, ...channels.filter(c => c.fontes.length)];
    return result.filter((c, i) => result.findIndex(d => d.id === c.id) === i).slice(0, 12);
  }, [channels, favorites]);

  const recentChannels = useMemo(() =>
    recents.map(id => channels.find(c => c.id === id)).filter((c): c is CanalTV => !!c).slice(0, 8),
    [channels, recents]);

  const guideChannels = useMemo(() => {
    const search = normalize(guideQuery);
    return channels.filter(c => !search || normalize(c.nome + " " + c.categoria).includes(search));
  }, [channels, guideQuery]);

  const currentProgram = (active && guide[active.nome]?.atual) || activeEpg?.atual || null;
  const currentNext = (active && guide[active.nome]?.proximo) || activeEpg?.proximos?.[0] || null;
  const fmtTime = (stamp: string | null) => {
    if (!stamp) return "";
    const d = new Date(stamp);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <main className="ztv-studio">
      <div className="ztv-backdrop" aria-hidden="true" />
      <div className="ztv-content">
        <header className="ztv-header">
          <div className="ztv-intro">
            <span className="ztv-eyebrow"><span className="ztv-pulse" /> CENTRAL DE TRANSMISSÃO <span className="ztv-eyebrow-divider">/</span> ZANG LIVE</span>
            <h1>TV ao vivo<span className="ztv-heading-dot">.</span></h1>
            <p>Seus canais em um só lugar, com fontes alternativas e troca automática de servidor.</p>
          </div>
          <div className="ztv-header-actions">
            <button type="button" className="ztv-btn ztv-btn-subtle" onClick={() => void refresh()} disabled={refreshing} aria-label="Atualizar lista de canais">
              <RefreshCw size={16} className={refreshing ? "ztv-spinning" : ""} /> Atualizar
            </button>
            <button type="button" className="ztv-btn ztv-btn-primary" onClick={() => setGuideOpen(true)}>
              <CalendarDays size={16} /> Guia de programação
            </button>
          </div>
        </header>

        <div className="ztv-statbar" role="status" aria-live="polite">
          <span><Tv2 size={16} /><strong>{channels.length || "—"}</strong> canais no catálogo</span>
          <span className="ztv-stat-separator" aria-hidden="true" />
          <span><Signal size={16} /><strong>{availableCount || "—"}</strong> com fontes</span>
          <span className="ztv-stat-separator" aria-hidden="true" />
          <span><span className="ztv-stat-source-dot" /><strong>{sourceCount || "—"}</strong> links de transmissão</span>
          {updatedAt && <span className="ztv-stat-updated">Lista sincronizada {fmtTime(updatedAt)}</span>}
        </div>

        {catalogError && (
          <div className="ztv-notice" role="alert">
            <AlertCircle size={18} />
            <span>{channels.length ? "Não foi possível atualizar as fontes; mantendo a última lista." : "A lista de TV não está acessível: " + catalogError}</span>
            <button type="button" onClick={() => void refresh()}>Tentar novamente</button>
          </div>
        )}

        <div className="ztv-stage">
          <section className="ztv-featured" aria-label="Reprodutor de TV ao vivo">
            <div className="ztv-player-frame">
              {active ? (
                <LivePlayer
                  key={active.id}
                  canal={active}
                  epgAtual={currentProgram || undefined}
                  onPrevCanal={() => switchChannel(-1)}
                  onNextCanal={() => switchChannel(1)}
                  onToggleGuide={() => setGuideOpen(true)}
                  onLoadingChange={setPlayerLoading}
                />
              ) : (
                <div className="ztv-player-placeholder">
                  <Tv2 size={42} />
                  <strong>{loading ? "Preparando sua TV…" : "Nenhum canal disponível"}</strong>
                  <span>{loading ? "Carregando canais e servidores" : "Atualize o catálogo para tentar novamente"}</span>
                </div>
              )}
            </div>
            <div className="ztv-now-panel">
              <div className="ztv-now-main">
                {active && <ChannelLogo channel={active} />}
                <div className="ztv-now-copy">
                  <div className="ztv-now-kicker"><span className="ztv-pulse" /> AGORA NA TV <span>·</span> {active?.categoria || "Ao vivo"}</div>
                  <h2>{active?.nome || "Escolha um canal"}</h2>
                  <p>
                    {currentProgram?.titulo
                      ? (currentProgram.horario ? currentProgram.horario + " · " : "") + currentProgram.titulo
                      : active?.fontes.length ? (playerLoading ? "Sintonizando transmissão…" : "Transmissão ao vivo") : "Canal sem fonte ativa no momento"}
                  </p>
                  {currentNext?.titulo && <small>Em seguida: {currentNext.titulo}</small>}
                </div>
              </div>
              <div className="ztv-now-actions">
                <button type="button" className="ztv-round-action" onClick={() => active && toggleFavorite(active.id)} disabled={!active} title={active && favorites.includes(active.id) ? "Remover favorito" : "Favoritar canal"}
                  aria-label={active && favorites.includes(active.id) ? "Remover favorito" : "Favoritar canal"}>
                  <Heart size={18} fill={active && favorites.includes(active.id) ? "currentColor" : "none"} />
                </button>
                <button type="button" className="ztv-round-action" onClick={() => switchChannel(-1)} title="Canal anterior" aria-label="Canal anterior"><ChevronLeft size={20} /></button>
                <button type="button" className="ztv-round-action" onClick={() => switchChannel(1)} title="Próximo canal" aria-label="Próximo canal"><ChevronRight size={20} /></button>
              </div>
            </div>
          </section>

          <aside className="ztv-quick" aria-label="Canais em destaque">
            <div className="ztv-section-row">
              <div><span className="ztv-label-small">ESCOLHA RÁPIDA</span><h2>Na sua TV</h2></div>
              <span className="ztv-small-live"><span className="ztv-pulse" /> AO VIVO</span>
            </div>
            <div className="ztv-quick-scroll">
              {loading && !quickChannels.length && Array.from({ length: 6 }).map((_, i) => <div key={i} className="ztv-quick-skeleton skeleton" />)}
              {quickChannels.map((channel, index) => (
                <button
                  key={channel.id} type="button"
                  className={"ztv-quick-item" + (active?.id === channel.id ? " is-active" : "")}
                  onClick={() => selectChannel(channel)}
                  aria-current={active?.id === channel.id ? "true" : undefined}
                >
                  <span className="ztv-quick-number">{String(index + 1).padStart(2, "0")}</span>
                  <ChannelLogo channel={channel} small />
                  <span className="ztv-quick-name"><strong>{channel.nome}</strong><small>{channel.categoria}</small></span>
                  {active?.id === channel.id ? <span className="ztv-equalizer" aria-label="Reproduzindo"><i /><i /><i /></span> : <ChevronRight size={17} className="ztv-quick-arrow" />}
                </button>
              ))}
            </div>
            <div className="ztv-quick-footer">
              <span><Signal size={14} /> {availableCount} canais com links</span>
              <button type="button" onClick={() => document.getElementById("ztv-explore")?.scrollIntoView({ behavior: "smooth" })}>Ver todos <ChevronRight size={15} /></button>
            </div>
          </aside>
        </div>

        {recentChannels.length > 0 && (
          <section className="ztv-recents" aria-label="Canais vistos recentemente">
            <div className="ztv-section-row"><div><span className="ztv-label-small">SEU HISTÓRICO</span><h2>Assistidos recentemente</h2></div></div>
            <div className="ztv-recent-scroll">
              {recentChannels.map(channel => (
                <button key={channel.id} type="button" className="ztv-recent-card" onClick={() => selectChannel(channel)}>
                  <ChannelLogo channel={channel} small />
                  <span>{channel.nome}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="ztv-explore" id="ztv-explore" aria-label="Catálogo de canais de TV">
          <div className="ztv-section-row ztv-explore-heading">
            <div><span className="ztv-label-small">NAVEGUE PELOS CANAIS</span><h2>Explore a programação</h2></div>
            <div className="ztv-layout-switch" aria-label="Modo de visualização">
              <button type="button" aria-label="Visualização em grade" aria-pressed={layout === "grid"} className={layout === "grid" ? "is-active" : ""} onClick={() => setLayout("grid")}><Grid2X2 size={18} /></button>
              <button type="button" aria-label="Visualização em lista" aria-pressed={layout === "list"} className={layout === "list" ? "is-active" : ""} onClick={() => setLayout("list")}><List size={19} /></button>
            </div>
          </div>
          <div className="ztv-filterbox">
            <label className="ztv-search">
              <Search size={19} />
              <input type="search" value={query} placeholder="Buscar canais ou categorias…" onChange={event => setQuery(event.target.value)} aria-label="Buscar canais" />
              {query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")}><X size={16} /></button>}
            </label>
            <label className="ztv-only-available">
              <input type="checkbox" checked={onlineOnly} onChange={event => setOnlineOnly(event.target.checked)} />
              <span>Somente com fonte</span>
            </label>
          </div>
          <div className="ztv-categories" role="group" aria-label="Filtrar por categoria">
            {["Todos", "Favoritos", "Recentes", ...categories].map(cat => {
              const count = cat === "Todos" ? channels.length :
                cat === "Favoritos" ? channels.filter(c => favorites.includes(c.id)).length :
                cat === "Recentes" ? recentChannels.length :
                channels.filter(c => c.categoria === cat).length;
              return (
                <button type="button" key={cat} onClick={() => setCategory(cat)}
                  className={"ztv-category" + (category === cat ? " is-active" : "")}
                  aria-pressed={category === cat}>
                  {cat === "Favoritos" && <Star size={14} />}
                  {cat === "Recentes" && <Clock3 size={14} />}
                  {cat}<span>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="ztv-results"><span>{filtered.length} {filtered.length === 1 ? "canal encontrado" : "canais encontrados"}</span><small>Fontes podem variar conforme a disponibilidade dos servidores.</small></div>
          {loading && !channels.length ? (
            <div className="ztv-channel-grid">
              {Array.from({ length: 12 }).map((_, i) => <div key={i} className="ztv-card ztv-card-skeleton skeleton" />)}
            </div>
          ) : filtered.length ? (
            <>
              <div className={"ztv-channel-grid" + (layout === "list" ? " is-list" : "")}>
                {filtered.slice(0, visible).map(channel => (
                  <ChannelCard key={channel.id} channel={channel} active={active?.id === channel.id}
                    favorite={favorites.includes(channel.id)}
                    onSelect={() => selectChannel(channel)}
                    onFavorite={() => toggleFavorite(channel.id)} listMode={layout === "list"} />
                ))}
              </div>
              {visible < filtered.length && <div className="ztv-load-more" ref={loaderRef}><button type="button" onClick={() => setVisible(n => Math.min(n + 36, filtered.length))}>Carregar mais canais</button></div>}
            </>
          ) : (
            <div className="ztv-empty">
              <WifiOff size={35} />
              <strong>{channels.length ? "Nenhum canal encontrado" : "Ainda sem canais"}</strong>
              <p>{channels.length ? "Altere os filtros ou procure outro canal." : "Não foi possível obter a lista de canais."}</p>
              <button type="button" onClick={() => { setCategory("Todos"); setQuery(""); setOnlineOnly(false); void refresh(); }}>Limpar filtros e atualizar</button>
            </div>
          )}
        </section>

        <section className="ztv-sports" aria-label="Programação esportiva"><JogosShelf onSelectCanalId={id => {
          const channel = channels.find(c => c.id === id);
          if (channel) selectChannel(channel);
        }} /></section>

        <footer className="ztv-footer">
          <span><span className="ztv-pulse" /> ZANG LIVE</span>
          <span>As transmissões dependem das fontes cadastradas e da disponibilidade de cada servidor.</span>
          <Link to="/tv/radios"><Radio size={15} /> Ouça rádios online</Link>
        </footer>
      </div>

      {guideOpen && (
        <div className="ztv-guide-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
          <aside className="ztv-guide" role="dialog" aria-modal="true" aria-labelledby="ztv-guide-title">
            <header className="ztv-guide-header">
              <div><span className="ztv-label-small">O QUE ESTÁ PASSANDO</span><h2 id="ztv-guide-title">Guia de programação</h2><p>Agora e a seguir nos seus canais</p></div>
              <button type="button" onClick={() => setGuideOpen(false)} aria-label="Fechar guia"><X size={22} /></button>
            </header>
            <label className="ztv-search ztv-guide-search"><Search size={18} /><input value={guideQuery} onChange={event => setGuideQuery(event.target.value)} placeholder="Pesquisar programação…" /></label>
            <div className="ztv-guide-list">
              {guideLoading && <p className="ztv-guide-loading">Atualizando a programação…</p>}
              {guideChannels.map(channel => {
                const slot = guide[channel.nome];
                return (
                  <button type="button" className={"ztv-guide-item" + (channel.id === active?.id ? " is-active" : "")}
                    key={channel.id} onClick={() => { selectChannel(channel); setGuideOpen(false); }}>
                    <ChannelLogo channel={channel} small />
                    <span className="ztv-guide-item-info"><strong>{channel.nome}</strong>
                      <span>{slot?.atual?.titulo || "Programação não informada"}</span>
                      {slot?.proximo?.titulo && <small>Depois: {slot.proximo.titulo}</small>}
                    </span>
                    {slot?.atual?.horario && <span className="ztv-guide-time">{slot.atual.horario}</span>}
                    <ChevronRight size={17} />
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
