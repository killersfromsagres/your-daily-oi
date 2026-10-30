"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { type CanalTV, fetchCanaisFallbackClient } from "@/lib/canais";
import type { CanalEPG, ProgramaEPG } from "@/lib/epg";
import { LivePlayer } from "@/components/player/LivePlayer";
import { JogosShelf } from "@/components/tv/JogosShelf";
import {
  Search,
  Star,
  Tv,
  Radio,
  Flame,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Layers,
  Heart,
  CalendarClock,
  X,
} from "lucide-react";

const LAST_CANAL_KEY = "zangflix:tv-last-channel";
const FAV_CANAIS_KEY = "zangflix:tv-favorites";

function ChannelLogo({
  logo,
  nome,
  className,
  monogramClass,
}: {
  logo?: string;
  nome: string;
  className: string;
  monogramClass: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) {
    return <span className={monogramClass}>{nome.slice(0, 3).toUpperCase()}</span>;
  }
  return (
    <img
      src={logo}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

interface TvViewProps {
  initialCanalId?: string;
}

export function TvView({ initialCanalId }: TvViewProps) {
  const navigate = useNavigate();
  const [canais, setCanais] = useState<CanalTV[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string>(initialCanalId || "");
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [epgData, setEpgData] = useState<Record<string, CanalEPG>>({});

  // Guia de Programação (Drawer / EPG completo)
  const [guideOpen, setGuideOpen] = useState(false);
  const [gradeAgora, setGradeAgora] = useState<
    Record<string, { atual: ProgramaEPG | null; proximo: ProgramaEPG | null }>
  >({});
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideSearch, setGuideSearch] = useState("");
  const [guideVisibleCount, setGuideVisibleCount] = useState(40);
  const gradeCacheRef = useRef<{
    data: Record<string, { atual: ProgramaEPG | null; proximo: ProgramaEPG | null }>;
    timestamp: number;
  } | null>(null);

  // Paginação progressiva do painel de canais (renderiza ~35 por vez para alta performance com 408 canais)
  const [visibleCount, setVisibleCount] = useState(35);
  const listObserverRef = useRef<HTMLDivElement>(null);

  // Carrega favoritos do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_CANAIS_KEY);
      if (raw) {
        setFavorites(new Set(JSON.parse(raw)));
      }
    } catch {
      // ignora
    }
  }, []);

  const toggleFavorite = useCallback((id: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_CANAIS_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, []);

  // Busca lista de canais da API /api/canais com fallback direto ao Saimo TV no navegador
  useEffect(() => {
    let active = true;
    setLoading(true);

    const applyCanaisData = (data: { canais: CanalTV[]; categorias: string[] }) => {
      if (!active) return;
      setCanais(data.canais);
      setCategorias(data.categorias);

      // Se houver initialCanalId válido, usa ele
      if (initialCanalId && data.canais.some((c) => c.id === initialCanalId)) {
        setActiveId(initialCanalId);
      } else {
        // Tenta reabrir o último canal assistido do localStorage
        const lastSaved = localStorage.getItem(LAST_CANAL_KEY);
        if (lastSaved && data.canais.some((c) => c.id === lastSaved)) {
          setActiveId(lastSaved);
        } else if (data.canais.length > 0) {
          // Primeiro canal da lista (ou prioritário Globo/SporTV)
          const defaultCanal =
            data.canais.find((c) => /globo|sportv/i.test(c.nome)) || data.canais[0];
          setActiveId(defaultCanal.id);
        }
      }
    };

    fetch("/api/canais", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          atualizadoEm: string;
          categorias: string[];
          canais: CanalTV[];
        }>;
      })
      .then((data) => {
        if (!data?.canais || data.canais.length === 0) {
          throw new Error("Catálogo vazio retornado da API");
        }
        applyCanaisData(data);
      })
      .catch(async (err: unknown) => {
        console.warn("[TvView] Rota /api/canais falhou, recorrendo ao catálogo direto do Saimo:", err);
        try {
          const fallbackData = await fetchCanaisFallbackClient();
          applyCanaisData(fallbackData);
        } catch (fbErr: unknown) {
          if (!active) return;
          setError(fbErr instanceof Error ? fbErr.message : "Erro ao carregar canais");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialCanalId]);

  // Canal ativo atual
  const activeCanal = useMemo(() => {
    return canais.find((c) => c.id === activeId) || canais[0];
  }, [canais, activeId]);

  // Atualiza canal ativo e persiste deep-link e localStorage
  const selectCanal = useCallback(
    (canal: CanalTV) => {
      setActiveId(canal.id);
      try {
        localStorage.setItem(LAST_CANAL_KEY, canal.id);
      } catch {}
      // Atualiza URL para deep-link sem recarregar
      void navigate({
        to: "/tv/canal/$id",
        params: { id: canal.id },
        replace: true,
      });
    },
    [navigate]
  );

  const handleSelectCanalId = useCallback(
    (canalId: string) => {
      const found = canais.find((c) => c.id === canalId);
      if (found) {
        selectCanal(found);
      } else {
        setActiveId(canalId);
      }
    },
    [canais, selectCanal]
  );

  // Busca EPG sob demanda para o canal ativo
  useEffect(() => {
    if (!activeCanal?.nome) return;
    const nome = activeCanal.nome;

    if (epgData[nome]) return;

    let active = true;
    fetch(`/api/epg?canal=${encodeURIComponent(nome)}`)
      .then((res) => res.json() as Promise<CanalEPG>)
      .then((data) => {
        if (!active) return;
        setEpgData((prev) => ({ ...prev, [nome]: data }));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [activeCanal?.nome, epgData]);

  // Busca lista de grade completa ao abrir o Guia de Programação (com cache de 5 min)
  useEffect(() => {
    if (!guideOpen) return;
    const now = Date.now();
    if (gradeCacheRef.current && now - gradeCacheRef.current.timestamp < 5 * 60 * 1000) {
      setGradeAgora(gradeCacheRef.current.data);
      return;
    }

    let active = true;
    setGuideLoading(true);

    fetch("/api/epg/agora")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<
          Array<{
            canalNome: string;
            atual: ProgramaEPG | null;
            proximo: ProgramaEPG | null;
          }>
        >;
      })
      .then((list) => {
        if (!active) return;
        const map: Record<string, { atual: ProgramaEPG | null; proximo: ProgramaEPG | null }> = {};
        for (const item of list) {
          map[item.canalNome] = { atual: item.atual, proximo: item.proximo };
        }
        gradeCacheRef.current = { data: map, timestamp: Date.now() };
        setGradeAgora(map);
      })
      .catch((err) => {
        console.warn("[TvView] Falha ao carregar /api/epg/agora:", err);
      })
      .finally(() => {
        if (active) setGuideLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guideOpen]);

  // Fecha guia com tecla Escape
  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGuideOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guideOpen]);

  // Lista ordenada e filtrada para o Guia de Programação
  const guideFilteredCanais = useMemo(() => {
    const sorted = [...canais].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (!guideSearch.trim()) return sorted;
    const q = guideSearch.toLowerCase().trim();
    return sorted.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.categoria.toLowerCase().includes(q)
    );
  }, [canais, guideSearch]);

  // Navegação anterior / próximo canal
  const handlePrevCanal = useCallback(() => {
    if (canais.length === 0) return;
    const idx = canais.findIndex((c) => c.id === activeId);
    const prevIdx = idx > 0 ? idx - 1 : canais.length - 1;
    selectCanal(canais[prevIdx]);
  }, [canais, activeId, selectCanal]);

  const handleNextCanal = useCallback(() => {
    if (canais.length === 0) return;
    const idx = canais.findIndex((c) => c.id === activeId);
    const nextIdx = idx < canais.length - 1 ? idx + 1 : 0;
    selectCanal(canais[nextIdx]);
  }, [canais, activeId, selectCanal]);

  // Filtro de canais para o painel lateral
  const filteredCanais = useMemo(() => {
    let result = canais;

    if (activeCategory === "Favoritos") {
      result = result.filter((c) => favorites.has(c.id));
    } else if (activeCategory !== "Todos") {
      result = result.filter((c) => c.categoria === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.categoria.toLowerCase().includes(q)
      );
    }

    return result;
  }, [canais, activeCategory, searchQuery, favorites]);

  // Reseta visibilidade ao mudar filtros de busca
  useEffect(() => {
    setVisibleCount(35);
  }, [activeCategory, searchQuery]);

  // Infinite scroll observer para a lista de canais
  useEffect(() => {
    const el = listObserverRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 30, filteredCanais.length));
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredCanais.length]);

  // Prateleiras por categoria para a seção inferior
  const shelvesData = useMemo(() => {
    if (canais.length === 0) return [];

    // Prateleira "Ao vivo agora" (Destaques com esportes e canais abertos populares)
    const highlights = canais
      .filter((c) =>
        /globo|sportv|espn|premiere|tnt|band|record|sbt/i.test(c.nome)
      )
      .slice(0, 12);

    const shelves = [
      {
        title: "Ao vivo agora",
        icon: Flame,
        items: highlights.length >= 6 ? highlights : canais.slice(0, 12),
      },
    ];

    const shelfCategories = [
      "TV Aberta",
      "Esportes",
      "Notícias",
      "Infantil",
      "Documentários",
      "Filmes e Séries",
      "Variedades",
    ];

    for (const cat of shelfCategories) {
      const items = canais.filter((c) => c.categoria === cat);
      if (items.length > 0) {
        shelves.push({
          title: cat,
          icon: Tv,
          items,
        });
      }
    }

    return shelves;
  }, [canais]);

  return (
    <main className="ydo-tv-page">
      {/* Subnavegação da seção TV */}
      <div className="ydo-tv-subnav">
        <div className="ydo-tv-subnav-left">
          <h1 className="ydo-tv-main-title">
            <Tv size={22} style={{ color: "#e8b44a" }} />
            <span>TV Ao Vivo</span>
          </h1>
          <span className="ydo-tv-badge-live">
            <span className="ydo-live-dot" />
            408 Canais
          </span>
        </div>

        <div className="ydo-tv-subnav-links">
          <Link to="/tv" className="ydo-tv-sublink active">
            <Layers size={14} />
            <span>Canais de TV</span>
          </Link>
          <button
            onClick={() => setGuideOpen((o) => !o)}
            className={`ydo-tv-sublink-btn ${guideOpen ? "active" : ""}`}
            type="button"
            aria-label="Guia de Programação"
          >
            <CalendarClock size={14} />
            <span>Guia de Programação</span>
          </button>
          <Link to="/tv/radios" className="ydo-tv-sublink">
            <Radio size={14} />
            <span>Rádios Online</span>
          </Link>
        </div>
      </div>

      {/* Prateleira Jogos de Hoje (Brasileirão) */}
      <JogosShelf onSelectCanalId={handleSelectCanalId} />

      {/* Grid Principal (2 Colunas Desktop / 1 Coluna Mobile) */}
      <div className="ydo-tv-layout">
        {/* Coluna Esquerda: Player Ao Vivo */}
        <div className="ydo-tv-main-col">
          {activeCanal ? (
            <LivePlayer
              canal={activeCanal}
              epgAtual={
                epgData[activeCanal.nome]?.atual ||
                gradeAgora[activeCanal.nome]?.atual ||
                undefined
              }
              onPrevCanal={handlePrevCanal}
              onNextCanal={handleNextCanal}
              onToggleGuide={() => setGuideOpen((o) => !o)}
              onLoadingChange={setPlayerLoading}
            />
          ) : (
            <div className="ydo-live-player-container skeleton" />
          )}
        </div>

        {/* Coluna Direita: Painel e Lista de Canais */}
        <aside className="ydo-tv-sidebar">
          {/* Busca de canais */}
          <div className="ydo-tv-search-box">
            <Search size={15} className="ydo-tv-search-icon" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal ou categoria…"
              className="ydo-tv-search-input"
              aria-label="Buscar canal de TV"
            />
          </div>

          {/* Pílulas de Categoria */}
          <div className="ydo-tv-category-pills">
            <button
              onClick={() => setActiveCategory("Todos")}
              className={`ydo-tv-cat-pill ${activeCategory === "Todos" ? "active" : ""}`}
            >
              Todos ({canais.length})
            </button>
            {favorites.size > 0 && (
              <button
                onClick={() => setActiveCategory("Favoritos")}
                className={`ydo-tv-cat-pill ${activeCategory === "Favoritos" ? "active" : ""}`}
              >
                ★ Favoritos ({favorites.size})
              </button>
            )}
            {categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`ydo-tv-cat-pill ${activeCategory === cat ? "active" : ""}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Lista Virtualizada / Lazy Loading de Canais */}
          <div className="ydo-tv-channel-list">
            {loading && canais.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="ydo-tv-channel-item skeleton" style={{ height: 56 }} />
              ))
            ) : filteredCanais.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: "0.88rem" }}>
                Nenhum canal encontrado para a busca.
              </div>
            ) : (
              filteredCanais.slice(0, visibleCount).map((c) => {
                const isActive = c.id === activeId;
                const isFav = favorites.has(c.id);
                const epg = epgData[c.nome]?.atual;

                return (
                  <div
                    key={c.id}
                    onClick={() => selectCanal(c)}
                    className={`ydo-tv-channel-item ${isActive ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") selectCanal(c);
                    }}
                  >
                    <div className="ydo-tv-logo-container">
                      <ChannelLogo
                        logo={c.logo}
                        nome={c.nome}
                        className="ydo-tv-channel-logo"
                        monogramClass="ydo-tv-monogram"
                      />
                    </div>

                    <div className="ydo-tv-channel-info">
                      <div className="ydo-tv-channel-name-row">
                        <span className="ydo-tv-channel-name">{c.nome}</span>
                        {isActive && <span className="ydo-live-dot" />}
                      </div>
                      <div className="ydo-tv-channel-epg-text">
                        {isActive && playerLoading
                          ? "Sintonizando…"
                          : epg?.titulo
                          ? `${epg.horario ? `${epg.horario} · ` : ""}${epg.titulo}`
                          : c.categoria}
                      </div>
                    </div>

                    <button
                      onClick={(e) => toggleFavorite(c.id, e)}
                      className={`ydo-tv-fav-btn ${isFav ? "is-fav" : ""}`}
                      title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                      aria-label="Favoritar canal"
                    >
                      <Star size={14} fill={isFav ? "#e8b44a" : "none"} />
                    </button>
                  </div>
                );
              })
            )}

            {/* Elemento de sentinela para carregar mais itens */}
            {visibleCount < filteredCanais.length && (
              <div ref={listObserverRef} className="ydo-tv-loading-more">
                Carregando mais canais…
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Prateleiras Horizontais de Canais por Categoria */}
      <section className="ydo-tv-shelves">
        {shelvesData.map((shelf) => {
          const Icon = shelf.icon;
          return (
            <div key={shelf.title} className="ydo-tv-shelf-section">
              <div className="ydo-tv-shelf-header">
                <h3 className="ydo-tv-shelf-title">
                  <Icon size={18} style={{ color: "#e8b44a" }} />
                  <span>{shelf.title}</span>
                </h3>
              </div>

              <div className="ydo-tv-shelf-track">
                {shelf.items.map((c) => {
                  const epg = epgData[c.nome]?.atual;
                  return (
                    <div
                      key={c.id}
                      onClick={() => selectCanal(c)}
                      className="ydo-tv-shelf-card"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") selectCanal(c);
                      }}
                    >
                      <div className="ydo-tv-shelf-logo-box">
                        <ChannelLogo
                          logo={c.logo}
                          nome={c.nome}
                          className="ydo-tv-shelf-logo"
                          monogramClass="ydo-tv-monogram"
                        />
                      </div>
                      <div className="ydo-tv-shelf-card-title">{c.nome}</div>
                      <div className="ydo-tv-shelf-card-epg">
                        {c.id === activeId && playerLoading
                          ? "Sintonizando…"
                          : epg?.titulo
                          ? epg.titulo
                          : c.categoria}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Guia de Programação (Drawer Lateral Overlay) */}
      {guideOpen && (
        <div
          className="ydo-guia-overlay"
          onClick={() => setGuideOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Guia de Programação"
        >
          <div
            className="ydo-guia-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ydo-guia-header">
              <div className="ydo-guia-header-info">
                <div className="ydo-guia-title-row">
                  <CalendarClock size={20} style={{ color: "#e8b44a" }} />
                  <h2 className="ydo-guia-title">Guia de Programação</h2>
                </div>
                <span className="ydo-guia-date">
                  {new Intl.DateTimeFormat("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date())}
                </span>
              </div>
              <button
                onClick={() => setGuideOpen(false)}
                className="ydo-guia-close-btn"
                aria-label="Fechar Guia"
              >
                <X size={18} />
              </button>
            </div>

            <div className="ydo-guia-search-wrap">
              <div className="ydo-guia-search-box">
                <Search size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
                <input
                  type="search"
                  value={guideSearch}
                  onChange={(e) => setGuideSearch(e.target.value)}
                  placeholder="Filtrar canal no guia…"
                  className="ydo-guia-search-input"
                  aria-label="Filtrar canais no guia"
                />
              </div>
            </div>

            <div className="ydo-guia-body">
              {guideLoading && Object.keys(gradeAgora).length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="ydo-guia-skeleton" />
                ))
              ) : guideFilteredCanais.length === 0 ? (
                <div
                  style={{
                    padding: "40px 16px",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "0.88rem",
                  }}
                >
                  Nenhum canal encontrado.
                </div>
              ) : (
                guideFilteredCanais.slice(0, guideVisibleCount).map((c) => {
                  const epg = gradeAgora[c.nome] || epgData[c.nome];
                  const isActive = c.id === activeId;

                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        selectCanal(c);
                        setGuideOpen(false);
                      }}
                      className={`ydo-guia-item ${isActive ? "active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          selectCanal(c);
                          setGuideOpen(false);
                        }
                      }}
                    >
                      <div className="ydo-guia-logo-container">
                        <ChannelLogo
                          logo={c.logo}
                          nome={c.nome}
                          className="ydo-guia-logo"
                          monogramClass="ydo-guia-monogram"
                        />
                      </div>

                      <div className="ydo-guia-content">
                        <div className="ydo-guia-canal-row">
                          <span className="ydo-guia-canal-nome">{c.nome}</span>
                          <span className="ydo-guia-categoria">{c.categoria}</span>
                        </div>

                        {epg?.atual ? (
                          <div className="ydo-guia-linha-agora">
                            <span className="ydo-live-dot" />
                            <span>
                              Agora: {epg.atual.titulo}
                              {epg.atual.horario ? ` · ${epg.atual.horario}` : ""}
                            </span>
                          </div>
                        ) : (
                          <div className="ydo-guia-indisponivel">
                            Programação indisponível agora
                          </div>
                        )}

                        {epg?.proximo && (
                          <div className="ydo-guia-linha-proximo">
                            A seguir: {epg.proximo.titulo}
                            {epg.proximo.horario ? ` · ${epg.proximo.horario}` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {guideVisibleCount < guideFilteredCanais.length && (
                <button
                  onClick={() => setGuideVisibleCount((prev) => prev + 40)}
                  style={{
                    margin: "12px auto",
                    padding: "8px 20px",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Carregar mais canais
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
