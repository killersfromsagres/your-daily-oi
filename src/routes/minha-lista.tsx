import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Heart,
  Trash2,
  Play,
  Film,
  Tv,
  ArrowRight,
  Clock,
  RotateCcw,
  History,
  Info,
  Check,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem, WatchProgress } from "@/lib/types";
import {
  getSavedList,
  toggleSaved as toggleSavedStorage,
  getProgress,
  removeProgress,
  clearAllProgress,
} from "@/lib/storage";

export const Route = createFileRoute("/minha-lista")({
  component: MyListPage,
  head: () => ({ meta: [{ title: "Minha Lista & Continuar Assistindo — Zang Flix" }] }),
});

function getResumeLink(p: WatchProgress): string {
  const baseId = p.contentId || p.id.replace(/-t\d+-e\d+$/, "");
  if (p.type === "f") {
    return `/assistir/filme/${encodeURIComponent(baseId)}`;
  }
  if (p.type === "s") {
    const s = p.season || 1;
    const e = p.episode || 1;
    return `/assistir/serie/${encodeURIComponent(baseId)}/${s}/${e}`;
  }
  const s = p.season || 1;
  const e = p.episode || 1;
  return `/assistir/anime/${encodeURIComponent(baseId)}/${s}/${e}`;
}

function getDetailsLink(p: WatchProgress): string {
  const baseId = p.contentId || p.id.replace(/-t\d+-e\d+$/, "");
  if (p.type === "f") return `/filme/${encodeURIComponent(baseId)}`;
  if (p.type === "s") return `/serie/${encodeURIComponent(baseId)}`;
  return `/anime/${encodeURIComponent(baseId)}`;
}

function formatDuration(sec: number): string {
  if (!sec || !isFinite(sec)) return "0m";
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}h ${m % 60}m`;
  }
  return `${m} min`;
}

function MyListPage() {
  const [activeTab, setActiveTab] = useState<"continue" | "saved">("continue");
  const [progressList, setProgressList] = useState<WatchProgress[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de cada aba
  const [continueFilter, setContinueFilter] = useState<"all" | "f" | "s" | "a">("all");
  const [savedFilter, setSavedFilter] = useState<"all" | "f" | "s" | "a">("all");

  useEffect(() => {
    const progress = getProgress();
    const saved = getSavedList();
    setProgressList(progress);
    setSavedIds(saved);

    // Se não tiver nada em progresso mas tiver salvos, abre a aba de salvos por padrão
    if (progress.length === 0 && saved.length > 0) {
      setActiveTab("saved");
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/catalogo", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao buscar catálogo");
        return res.json() as Promise<{ items: CatalogItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        setAllItems(data.items || []);
      })
      .catch((err) => console.error("Erro na minha lista:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Itens salvos hidratados com o catálogo
  const savedItems = useMemo(() => {
    const idSet = new Set(savedIds);
    return allItems.filter((item) => idSet.has(item.id));
  }, [allItems, savedIds]);

  const filteredSavedItems = useMemo(() => {
    if (savedFilter === "all") return savedItems;
    return savedItems.filter((item) => item.type === savedFilter);
  }, [savedItems, savedFilter]);

  // Itens em progresso filtrados
  const filteredProgressItems = useMemo(() => {
    if (continueFilter === "all") return progressList;
    return progressList.filter((item) => item.type === continueFilter);
  }, [progressList, continueFilter]);

  const handleToggleSaved = (id: string) => {
    toggleSavedStorage(id);
    const updated = getSavedList();
    setSavedIds(updated);
  };

  const handleRemoveProgress = (id: string) => {
    removeProgress(id);
    setProgressList(getProgress());
  };

  const handleClearAllProgress = () => {
    if (window.confirm("Deseja realmente limpar todo o histórico de títulos em andamento?")) {
      clearAllProgress();
      setProgressList([]);
    }
  };

  const moviesCount = savedItems.filter((i) => i.type === "f").length;
  const seriesCount = savedItems.filter((i) => i.type === "s").length;
  const animesCount = savedItems.filter((i) => i.type === "a").length;

  const progMoviesCount = progressList.filter((i) => i.type === "f").length;
  const progSeriesCount = progressList.filter((i) => i.type === "s").length;
  const progAnimesCount = progressList.filter((i) => i.type === "a").length;

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0b14",
        color: "#ffffff",
        padding: "clamp(80px, 12vh, 120px) clamp(16px, 4vw, 48px) 60px",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Cabeçalho da Página com Abas Principais */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "24px",
            marginBottom: "32px",
            paddingBottom: "24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <History size={22} style={{ color: "#e8b44a" }} />
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: "800",
                  color: "#e8b44a",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Central Pessoal
              </span>
            </div>
            <h1
              style={{
                fontSize: "clamp(2rem, 4vw, 2.8rem)",
                fontWeight: "900",
                margin: 0,
                letterSpacing: "-0.03em",
              }}
            >
              Minha Lista & Progresso
            </h1>
            <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "0.95rem", margin: "6px 0 0" }}>
              Retome seus vídeos de onde parou e gerencie os títulos salvos para assistir.
            </p>
          </div>

          {/* Seletor de Abas Principais (Estilo Netflix / Disney+) */}
          <div
            style={{
              display: "flex",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              padding: "4px",
              borderRadius: "14px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              gap: "4px",
            }}
          >
            <button
              onClick={() => setActiveTab("continue")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "10px",
                fontSize: "0.9rem",
                fontWeight: "700",
                cursor: "pointer",
                border: "none",
                backgroundColor: activeTab === "continue" ? "#e8b44a" : "transparent",
                color: activeTab === "continue" ? "#0a0b14" : "rgba(255, 255, 255, 0.75)",
                transition: "all 0.2s ease",
              }}
            >
              <RotateCcw size={16} />
              Continuar Assistindo
              {progressList.length > 0 && (
                <span
                  style={{
                    backgroundColor: activeTab === "continue" ? "#0a0b14" : "rgba(232, 180, 74, 0.2)",
                    color: activeTab === "continue" ? "#e8b44a" : "#e8b44a",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: "800",
                  }}
                >
                  {progressList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("saved")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "10px",
                fontSize: "0.9rem",
                fontWeight: "700",
                cursor: "pointer",
                border: "none",
                backgroundColor: activeTab === "saved" ? "#e8b44a" : "transparent",
                color: activeTab === "saved" ? "#0a0b14" : "rgba(255, 255, 255, 0.75)",
                transition: "all 0.2s ease",
              }}
            >
              <Heart size={16} fill={activeTab === "saved" ? "#0a0b14" : "transparent"} />
              Títulos Salvos
              {savedItems.length > 0 && (
                <span
                  style={{
                    backgroundColor: activeTab === "saved" ? "#0a0b14" : "rgba(232, 180, 74, 0.2)",
                    color: activeTab === "saved" ? "#e8b44a" : "#e8b44a",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: "800",
                  }}
                >
                  {savedItems.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── ABA 1: CONTINUAR ASSISTINDO ────────────────────────────────────────── */}
        {activeTab === "continue" && (
          <div>
            {/* Barra de Filtros e Limpar Histórico */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={() => setContinueFilter("all")}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "999px",
                    fontSize: "0.82rem",
                    fontWeight: "700",
                    cursor: "pointer",
                    border: continueFilter === "all" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: continueFilter === "all" ? "rgba(232, 180, 74, 0.18)" : "rgba(255, 255, 255, 0.04)",
                    color: continueFilter === "all" ? "#e8b44a" : "#ffffff",
                    transition: "all 0.2s ease",
                  }}
                >
                  Todos ({progressList.length})
                </button>
                <button
                  onClick={() => setContinueFilter("f")}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "999px",
                    fontSize: "0.82rem",
                    fontWeight: "700",
                    cursor: "pointer",
                    border: continueFilter === "f" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: continueFilter === "f" ? "rgba(232, 180, 74, 0.18)" : "rgba(255, 255, 255, 0.04)",
                    color: continueFilter === "f" ? "#e8b44a" : "#ffffff",
                    transition: "all 0.2s ease",
                  }}
                >
                  Filmes ({progMoviesCount})
                </button>
                <button
                  onClick={() => setContinueFilter("s")}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "999px",
                    fontSize: "0.82rem",
                    fontWeight: "700",
                    cursor: "pointer",
                    border: continueFilter === "s" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: continueFilter === "s" ? "rgba(232, 180, 74, 0.18)" : "rgba(255, 255, 255, 0.04)",
                    color: continueFilter === "s" ? "#e8b44a" : "#ffffff",
                    transition: "all 0.2s ease",
                  }}
                >
                  Séries ({progSeriesCount})
                </button>
                <button
                  onClick={() => setContinueFilter("a")}
                  style={{
                    padding: "7px 16px",
                    borderRadius: "999px",
                    fontSize: "0.82rem",
                    fontWeight: "700",
                    cursor: "pointer",
                    border: continueFilter === "a" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: continueFilter === "a" ? "rgba(232, 180, 74, 0.18)" : "rgba(255, 255, 255, 0.04)",
                    color: continueFilter === "a" ? "#e8b44a" : "#ffffff",
                    transition: "all 0.2s ease",
                  }}
                >
                  Animes ({progAnimesCount})
                </button>
              </div>

              {progressList.length > 0 && (
                <button
                  onClick={handleClearAllProgress}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    border: "1px solid rgba(255, 80, 80, 0.3)",
                    backgroundColor: "rgba(255, 80, 80, 0.1)",
                    color: "#ff7070",
                    transition: "all 0.2s ease",
                  }}
                >
                  <Trash2 size={14} />
                  Limpar Histórico
                </button>
              )}
            </div>

            {/* Grid de Vídeos em Andamento */}
            {filteredProgressItems.length === 0 ? (
              <div
                style={{
                  padding: "80px 24px",
                  textAlign: "center",
                  borderRadius: "24px",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px dashed rgba(255, 255, 255, 0.12)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(232, 180, 74, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#e8b44a",
                  }}
                >
                  <RotateCcw size={36} />
                </div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: "800", margin: 0 }}>
                  Nenhum título em andamento
                </h2>
                <p
                  style={{
                    color: "rgba(255, 255, 255, 0.6)",
                    maxWidth: "460px",
                    margin: 0,
                    fontSize: "0.95rem",
                    lineHeight: "1.5",
                  }}
                >
                  Quando você começar a assistir a um filme, série ou anime, seu progresso será salvo
                  automaticamente para que você possa continuar de onde parou em qualquer dispositivo.
                </p>
                <Link to="/" className="ydo-btn-primary" style={{ marginTop: "12px" }}>
                  Explorar Catálogo <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "22px",
                }}
              >
                {filteredProgressItems.map((item) => {
                  const resumeUrl = getResumeLink(item);
                  const detailsUrl = getDetailsLink(item);
                  const hasDuration = item.duration && item.duration > 0;
                  const pct = hasDuration
                    ? Math.min(100, Math.max(5, Math.round((item.currentTime / item.duration!) * 100)))
                    : 30;

                  const typeLabel =
                    item.type === "f"
                      ? "FILME"
                      : item.season && item.episode
                        ? `T${item.season}:E${item.episode}`
                        : item.type === "a"
                          ? "ANIME"
                          : "SÉRIE";

                  return (
                    <div
                      key={item.id}
                      style={{
                        position: "relative",
                        borderRadius: "16px",
                        overflow: "hidden",
                        backgroundColor: "#121424",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
                        display: "flex",
                        flexDirection: "column",
                        transition: "transform 0.2s ease, border-color 0.2s ease",
                      }}
                    >
                      {/* Pôster com Overlay de Play */}
                      <div
                        style={{
                          position: "relative",
                          width: "100%",
                          aspectRatio: "16/10",
                          backgroundColor: "#0d0f19",
                          overflow: "hidden",
                        }}
                      >
                        {item.posterUrl ? (
                          <img
                            src={item.posterUrl}
                            alt={item.title}
                            loading="lazy"
                            decoding="async"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "#161826",
                              color: "rgba(255, 255, 255, 0.4)",
                              fontWeight: "700",
                            }}
                          >
                            {item.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}

                        {/* Sombra Gradiente */}
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(to top, rgba(18,20,36,0.95) 0%, rgba(18,20,36,0.2) 50%, rgba(0,0,0,0.6) 100%)",
                          }}
                        />

                        {/* Badge de Tipo / Temporada */}
                        <div
                          style={{
                            position: "absolute",
                            top: "10px",
                            left: "10px",
                            backgroundColor: "rgba(10, 11, 20, 0.85)",
                            border: "1px solid rgba(232, 180, 74, 0.4)",
                            color: "#e8b44a",
                            fontSize: "0.7rem",
                            fontWeight: "800",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {typeLabel}
                        </div>

                        {/* Botão de Remover do Progresso */}
                        <button
                          type="button"
                          onClick={() => handleRemoveProgress(item.id)}
                          title="Remover do histórico"
                          aria-label={`Remover ${item.title}`}
                          style={{
                            position: "absolute",
                            top: "10px",
                            right: "10px",
                            backgroundColor: "rgba(0, 0, 0, 0.65)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "rgba(255, 255, 255, 0.75)",
                            borderRadius: "50%",
                            width: "28px",
                            height: "28px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>

                        {/* Link Central com Botão de Play */}
                        <Link
                          to={resumeUrl}
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textDecoration: "none",
                          }}
                        >
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "50%",
                              backgroundColor: "rgba(232, 180, 74, 0.95)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#0a0b14",
                              boxShadow: "0 6px 20px rgba(232, 180, 74, 0.5)",
                              transition: "transform 0.2s ease",
                            }}
                          >
                            <Play size={22} fill="#0a0b14" style={{ marginLeft: "3px" }} />
                          </div>
                        </Link>

                        {/* Barra de Progresso no Rodapé da Thumbnail */}
                        <div
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: "5px",
                            backgroundColor: "rgba(255, 255, 255, 0.2)",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              backgroundColor: "#e8b44a",
                              boxShadow: "0 0 10px #e8b44a",
                            }}
                          />
                        </div>
                      </div>

                      {/* Informações e Ações */}
                      <div
                        style={{
                          padding: "14px 16px 16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          flex: 1,
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <h3
                            title={item.title}
                            style={{
                              fontSize: "0.95rem",
                              fontWeight: "700",
                              margin: "0 0 4px",
                              color: "#ffffff",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.title}
                          </h3>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: "0.78rem",
                              color: "rgba(255, 255, 255, 0.6)",
                            }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                              <Clock size={13} style={{ color: "#e8b44a" }} />
                              {item.currentTime > 0 ? formatDuration(item.currentTime) : "Começado"}
                              {item.duration && item.duration > 0 && ` / ${formatDuration(item.duration)}`}
                            </span>
                            <span style={{ fontWeight: "700", color: "#e8b44a" }}>{pct}%</span>
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                          <Link
                            to={resumeUrl}
                            style={{
                              flex: 1,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                              padding: "9px 12px",
                              borderRadius: "10px",
                              backgroundColor: "#e8b44a",
                              color: "#0a0b14",
                              fontSize: "0.85rem",
                              fontWeight: "800",
                              textDecoration: "none",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                            }}
                          >
                            <RotateCcw size={15} />
                            Retomar
                          </Link>

                          <Link
                            to={detailsUrl}
                            title="Ver detalhes"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "9px 12px",
                              borderRadius: "10px",
                              backgroundColor: "rgba(255, 255, 255, 0.08)",
                              border: "1px solid rgba(255, 255, 255, 0.12)",
                              color: "#ffffff",
                              fontSize: "0.85rem",
                              textDecoration: "none",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                            }}
                          >
                            <Info size={16} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA 2: TÍTULOS SALVOS (MINHA LISTA) ─────────────────────────────────── */}
        {activeTab === "saved" && (
          <div>
            {/* Filtros: Todos / Filmes / Séries / Animes */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
              <button
                onClick={() => setSavedFilter("all")}
                style={{
                  padding: "8px 18px",
                  borderRadius: "999px",
                  fontSize: "0.85rem",
                  fontWeight: "700",
                  cursor: "pointer",
                  border: savedFilter === "all" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                  backgroundColor: savedFilter === "all" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                  color: savedFilter === "all" ? "#0a0b14" : "#ffffff",
                  transition: "all 0.2s ease",
                }}
              >
                Todos ({savedItems.length})
              </button>
              <button
                onClick={() => setSavedFilter("f")}
                style={{
                  padding: "8px 18px",
                  borderRadius: "999px",
                  fontSize: "0.85rem",
                  fontWeight: "700",
                  cursor: "pointer",
                  border: savedFilter === "f" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                  backgroundColor: savedFilter === "f" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                  color: savedFilter === "f" ? "#0a0b14" : "#ffffff",
                  transition: "all 0.2s ease",
                }}
              >
                Filmes ({moviesCount})
              </button>
              <button
                onClick={() => setSavedFilter("s")}
                style={{
                  padding: "8px 18px",
                  borderRadius: "999px",
                  fontSize: "0.85rem",
                  fontWeight: "700",
                  cursor: "pointer",
                  border: savedFilter === "s" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                  backgroundColor: savedFilter === "s" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                  color: savedFilter === "s" ? "#0a0b14" : "#ffffff",
                  transition: "all 0.2s ease",
                }}
              >
                Séries ({seriesCount})
              </button>
              {animesCount > 0 && (
                <button
                  onClick={() => setSavedFilter("a")}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "999px",
                    fontSize: "0.85rem",
                    fontWeight: "700",
                    cursor: "pointer",
                    border: savedFilter === "a" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: savedFilter === "a" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                    color: savedFilter === "a" ? "#0a0b14" : "#ffffff",
                    transition: "all 0.2s ease",
                  }}
                >
                  Animes ({animesCount})
                </button>
              )}
            </div>

            {/* Conteúdo da Lista de Salvos */}
            {loading ? (
              <SkeletonRow count={8} />
            ) : filteredSavedItems.length === 0 ? (
              <div
                style={{
                  padding: "80px 24px",
                  textAlign: "center",
                  borderRadius: "24px",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px dashed rgba(255, 255, 255, 0.12)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                <Heart size={48} style={{ color: "rgba(232, 180, 74, 0.4)" }} />
                <h2 style={{ fontSize: "1.4rem", fontWeight: "800", margin: 0 }}>
                  Sua lista de salvos está vazia
                </h2>
                <p
                  style={{
                    color: "rgba(255, 255, 255, 0.6)",
                    maxWidth: "420px",
                    margin: 0,
                    fontSize: "0.95rem",
                  }}
                >
                  Nenhum título foi adicionado ainda. Ao encontrar um filme, série ou anime de seu interesse,
                  clique no botão <strong>Minha Lista</strong> para salvá-lo aqui.
                </p>
                <Link to="/" className="ydo-btn-primary" style={{ marginTop: "12px" }}>
                  Explorar Catálogo <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <div className="ydo-search-grid">
                {filteredSavedItems.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    isSaved={true}
                    onToggleSaved={handleToggleSaved}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
