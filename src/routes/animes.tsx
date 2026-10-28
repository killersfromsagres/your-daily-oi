import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { isAnimeItem } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";
import { Sparkles, Tv, Search, X, ChevronLeft, ChevronRight, Film, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/animes")({
  component: AnimesPage,
  head: () => ({ meta: [{ title: "Animes — Zang Flix" }] }),
});

interface SushiCardData {
  id: string;
  slug: string;
  title: string;
  posterUrl: string;
  quality?: string;
  rating?: number;
  genres: string[];
  audio: "dub" | "leg";
  year?: number;
}

interface SushiResponse {
  items: SushiCardData[];
  pagina: number;
  totalPaginas: number;
  totalItens: number;
}

const CATEGORIES: Array<{ label: string; slug: string }> = [
  { label: "Todos", slug: "" },
  { label: "Dublados", slug: "dublado" },
  { label: "Shōnen", slug: "sh-nen" },
  { label: "Ação", slug: "acao" },
  { label: "Aventura", slug: "aventura" },
  { label: "Comédia", slug: "comedia" },
  { label: "Drama", slug: "drama" },
  { label: "Fantasia", slug: "fantasia" },
  { label: "Sobrenatural", slug: "sobrenatural" },
  { label: "Romance", slug: "romance" },
  { label: "Ficção Científica", slug: "ficcao-cientifica" },
];

function sushiCardToCatalogItem(s: SushiCardData): CatalogItem {
  return {
    id: s.id,
    title: s.title,
    type: "a",
    posterUrl: s.posterUrl,
    genres: s.genres && s.genres.length > 0 ? s.genres : [s.audio === "dub" ? "Dublado" : "Legendado"],
    streams: [{ url: "pending", audio: s.audio, quality: s.quality }],
    seasons: [
      {
        seasonNumber: 1,
        episodes: [
          {
            seasonNumber: 1,
            episodeNumber: 1,
            streams: [{ url: "pending", audio: s.audio }],
          },
        ],
      },
    ],
    tmdb: {
      overview: "",
      voteAverage: s.rating || 8.0,
      backdropPath: null,
      backdropUrl: s.posterUrl,
      trailerId: null,
      cast: [],
      releaseYear: s.year || null,
      format: s.audio === "dub" ? "Dublado" : "Legendado",
    },
  };
}

function AnimesPage() {
  const [sushiItems, setSushiItems] = useState<SushiCardData[]>([]);
  const [localItems, setLocalItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Filtros e busca
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  // Debounce na busca digitada pelo usuário
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
      setCurrentPage(1);
    }, 350);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setCurrentPage(1);
  };

  // Carrega os animes clássicos do catálogo local (preservando o acervo anterior)
  useEffect(() => {
    let active = true;
    fetch("/api/catalogo", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items: CatalogItem[] } | null) => {
        if (!active || !data?.items) return;
        const classics = data.items.filter((i) => i.type === "a" || isAnimeItem(i));
        setLocalItems(classics);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Carrega catálogo principal do Sushi Animes
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    let apiUrl = `/api/animes-sushi?pagina=${currentPage}`;
    if (debouncedQuery) {
      apiUrl = `/api/animes-sushi?q=${encodeURIComponent(debouncedQuery)}`;
    } else if (selectedCategory) {
      apiUrl = `/api/animes-sushi?pagina=${currentPage}&categoria=${encodeURIComponent(selectedCategory)}`;
    }

    fetch(apiUrl, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar");
        return res.json() as Promise<SushiResponse>;
      })
      .then((data) => {
        if (!active) return;
        setSushiItems(data.items || []);
        setTotalPages(data.totalPaginas || 1);
        setTotalCount(data.totalItens || data.items?.length || 0);
      })
      .catch((err) => {
        console.error("Erro ao carregar animes do Sushi:", err);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentPage, debouncedQuery, selectedCategory]);

  const toggleSaved = (id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  };

  const handleCategoryClick = (catSlug: string) => {
    setSelectedCategory(catSlug);
    setSearchQuery("");
    setDebouncedQuery("");
    setCurrentPage(1);
  };

  // Converte cards para exibição via MediaCard
  const displayItems = useMemo(() => {
    return sushiItems.map(sushiCardToCatalogItem);
  }, [sushiItems]);

  const showPagination = !debouncedQuery && totalPages > 1;

  return (
    <main className="ydo-search-page" style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Cabeçalho */}
      <div className="ydo-search-header" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Sparkles size={28} style={{ color: "#e8b44a" }} />
          <h1 style={{ fontSize: "2rem", fontWeight: "900", letterSpacing: "-0.02em" }}>Animes</h1>
        </div>
        {!loading && (
          <span className="ydo-search-count">
            {totalCount > 0 ? `${totalCount} títulos indexados` : `${displayItems.length} resultados`}
          </span>
        )}
      </div>

      {/* Barra de Pesquisa Rápida com Ícones */}
      <div
        style={{
          position: "relative",
          marginBottom: "20px",
          maxWidth: "680px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "16px",
            padding: "4px 16px",
            transition: "all 0.2s ease",
          }}
        >
          <Search size={20} style={{ color: "rgba(255, 255, 255, 0.5)", marginRight: "12px", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar animes no acervo (ex: One Piece, Naruto, Bleach, Solo Leveling...)"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#ffffff",
              fontSize: "0.95rem",
              padding: "10px 0",
            }}
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              aria-label="Limpar busca"
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255, 255, 255, 0.6)",
                cursor: "pointer",
                padding: "6px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Pílulas de Filtros por Categoria / Gênero */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "14px",
          marginBottom: "24px",
          scrollbarWidth: "none",
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.slug;
          return (
            <button
              key={cat.label}
              onClick={() => handleCategoryClick(cat.slug)}
              style={{
                padding: "8px 18px",
                borderRadius: "999px",
                fontSize: "0.85rem",
                fontWeight: "700",
                cursor: "pointer",
                border: isActive ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: isActive ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                color: isActive ? "#0a0b14" : "#ffffff",
                transition: "all 0.18s ease",
                whiteSpace: "nowrap",
                boxShadow: isActive ? "0 4px 14px rgba(232, 180, 74, 0.3)" : "none",
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo Principal */}
      {loading ? (
        <SkeletonRow count={12} />
      ) : error ? (
        <div className="ydo-empty-state" style={{ padding: "60px 20px", textAlign: "center" }}>
          <Tv size={52} style={{ color: "rgba(232, 180, 74, 0.5)", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: "1.4rem", fontWeight: "800", marginBottom: "8px" }}>Instabilidade temporária no catálogo de animes</h2>
          <p style={{ color: "rgba(255, 255, 255, 0.6)", maxWidth: "520px", margin: "0 auto 20px" }}>
            Não conseguimos conectar aos servidores de animes neste momento. Você pode tentar recarregar ou navegar pelos clássicos abaixo.
          </p>
          <button
            onClick={() => setCurrentPage((p) => p)}
            className="ydo-btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <RefreshCw size={16} /> Tentar Novamente
          </button>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="ydo-empty-state" style={{ padding: "60px 20px", textAlign: "center" }}>
          <Tv size={48} style={{ color: "rgba(232, 180, 74, 0.5)", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: "1.3rem", fontWeight: "700" }}>Nenhum anime encontrado</h2>
          <p style={{ color: "rgba(255, 255, 255, 0.6)" }}>
            Tente pesquisar com outro termo ou selecionar outra categoria.
          </p>
        </div>
      ) : (
        <>
          <div className="ydo-search-grid">
            {displayItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                isSaved={savedIds.has(item.id)}
                onToggleSaved={toggleSaved}
              />
            ))}
          </div>

          {/* Paginação */}
          {showPagination && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                marginTop: "48px",
                paddingBottom: "24px",
                flexWrap: "wrap",
              }}
            >
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "12px",
                  backgroundColor: currentPage <= 1 ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: currentPage <= 1 ? "rgba(255, 255, 255, 0.25)" : "#ffffff",
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                  fontWeight: "700",
                  fontSize: "0.88rem",
                  transition: "all 0.18s ease",
                }}
              >
                <ChevronLeft size={18} /> Anterior
              </button>

              <span
                style={{
                  padding: "10px 20px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  color: "#ffffff",
                  fontWeight: "700",
                  fontSize: "0.88rem",
                }}
              >
                Página {currentPage} de {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "12px",
                  backgroundColor: currentPage >= totalPages ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: currentPage >= totalPages ? "rgba(255, 255, 255, 0.25)" : "#ffffff",
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                  fontWeight: "700",
                  fontSize: "0.88rem",
                  transition: "all 0.18s ease",
                }}
              >
                Próxima <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Seção Preservada: Clássicos do Japão (catálogo local de domínio público) */}
      {!debouncedQuery && localItems.length > 0 && currentPage === 1 && (
        <section style={{ marginTop: "64px", paddingTop: "32px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <Film size={22} style={{ color: "#e8b44a" }} />
            <h2 style={{ fontSize: "1.4rem", fontWeight: "800", color: "#ffffff" }}>
              Clássicos do Japão (Domínio Público)
            </h2>
          </div>
          <p style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: "0.88rem", marginBottom: "20px" }}>
            Títulos históricos da animação japonesa preservados no acervo original.
          </p>

          <div className="ydo-search-grid">
            {localItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                isSaved={savedIds.has(item.id)}
                onToggleSaved={toggleSaved}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
