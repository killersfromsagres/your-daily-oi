import { AnimeIcon } from "@/components/icons/ContentIcons";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { normalizeTitle, isAnimeItem } from "@/lib/catalog";
import { matchesGenre } from "@/lib/genre-matching";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";
import { getClientCatalog, CATALOG_PAGE_SIZE, catalogVisibleItems, nextCatalogPage } from "@/lib/catalog-client";
import { Film, Clapperboard, Filter } from "lucide-react";

interface GeneroSearch {
  tipo?: string;
}

export const Route = createFileRoute("/generos/$slug")({
  validateSearch: (search: Record<string, unknown>): GeneroSearch => ({
    tipo: typeof search.tipo === "string" ? search.tipo : undefined,
  }),
  component: GenrePage,
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — Zang Flix` }] }),
});

function GenrePage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE);
  const [loadError, setLoadError] = useState(false);

  const decoded = decodeURIComponent(slug);
  const normSlug = normalizeTitle(decoded);
  const isFilmes = normSlug === "filmes";
  const isSeries = normSlug === "series";

  // URL is the sole source of truth. Reusing the route for another genre must
  // never keep a stale filter from the previous selection.
  const selectedType = isFilmes ? "f" : isSeries ? "s" : search.tipo || "todos";

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    void getClientCatalog()
      .then(data => { if (active) setItems(data.items); })
      .catch(error => {
        console.error("Erro ao carregar catálogo:", error);
        if (active) setLoadError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Changing genre or content type must never inherit a huge DOM from a previous view.
  useEffect(() => { setVisibleCount(CATALOG_PAGE_SIZE); }, [slug, selectedType]);

  const filtered = useMemo(() => {
    let base = items;
    if (selectedType === "s" || selectedType === "serie" || selectedType === "series") {
      base = base.filter(item => item.type === "s");
    } else if (selectedType === "f" || selectedType === "filme" || selectedType === "filmes") {
      base = base.filter(item => item.type === "f");
    } else if (selectedType === "a" || selectedType === "anime" || selectedType === "animes") {
      base = base.filter(item => item.type === "a" || isAnimeItem(item));
    }
    if (isFilmes || isSeries) return base;
    return base.filter(item => item.genres?.some(genre => matchesGenre(decoded, genre)));
  }, [items, decoded, isFilmes, isSeries, selectedType]);

  // Some catalogs omit genre metadata. Show an explicitly labelled discovery
  // fallback for that content type rather than a blank page or fake genre tags.
  const fallback = useMemo(() => {
    if (filtered.length || isFilmes || isSeries || selectedType === "todos") return [];
    if (selectedType === "a") return items.filter(item => item.type === "a" || isAnimeItem(item));
    if (selectedType === "s") return items.filter(item => item.type === "s");
    if (selectedType === "f") return items.filter(item => item.type === "f");
    return [];
  }, [filtered.length, items, isFilmes, isSeries, selectedType]);
  const displayItems = filtered.length ? filtered : fallback;
  const visibleItems = useMemo(() => catalogVisibleItems(displayItems, visibleCount), [displayItems, visibleCount]);

  const rawTitle = isFilmes ? "Filmes" : isSeries ? "Séries" : decoded.charAt(0).toUpperCase() + decoded.slice(1);
  const typeBadge =
    selectedType === "s" || isSeries
      ? "Séries"
      : selectedType === "f" || isFilmes
        ? "Filmes"
        : selectedType === "a"
          ? "Animes"
          : null;

  const pageTitle = typeBadge && !isFilmes && !isSeries ? `${rawTitle} (${typeBadge})` : rawTitle;

  const handleTypeChange = (newType: string) => {
    void navigate({
      to: "/generos/$slug",
      params: { slug },
      search: newType === "todos" ? {} : { tipo: newType },
    });
  };

  const toggleSaved = (id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  };

  return (
    <main className="ydo-search-page">
      <div className="ydo-search-header">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {selectedType === "s" || isSeries ? (
              <Clapperboard size={26} style={{ color: "#e8b44a" }} />
            ) : selectedType === "a" ? (
              <AnimeIcon size={26} style={{ color: "#e8b44a" }} />
            ) : (
              <Film size={26} style={{ color: "#e8b44a" }} />
            )}
            <h1>{pageTitle}</h1>
          </div>
          <span style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.55)" }}>
            Catálogo completo e exclusivo Zang Flix
          </span>
        </div>
        {!loading && <span className="ydo-search-count">{displayItems.length} títulos</span>}
      </div>

      {/* Pílulas de filtro para alternar facilmente se desejar */}
      {!isFilmes && !isSeries && (
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "16px", marginBottom: "20px" }}>
          <button
            onClick={() => handleTypeChange("todos")}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "0.8rem",
              fontWeight: "700",
              cursor: "pointer",
              border: selectedType === "todos" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: selectedType === "todos" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
              color: selectedType === "todos" ? "#0a0b14" : "#ffffff",
              transition: "all 0.18s ease",
            }}
          >
            Todos
          </button>
          <button
            onClick={() => handleTypeChange("f")}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "0.8rem",
              fontWeight: "700",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              border: selectedType === "f" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: selectedType === "f" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
              color: selectedType === "f" ? "#0a0b14" : "#ffffff",
              transition: "all 0.18s ease",
            }}
          >
            <Film size={13} />
            Apenas Filmes
          </button>
          <button
            onClick={() => handleTypeChange("s")}
            style={{
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "0.8rem",
              fontWeight: "700",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              border: selectedType === "s" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: selectedType === "s" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
              color: selectedType === "s" ? "#0a0b14" : "#ffffff",
              transition: "all 0.18s ease",
            }}
          >
            <Clapperboard size={13} />
            Apenas Séries
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonRow count={8} />
      ) : loadError ? (
        <div className="ydo-empty-state">
          <h2>Não foi possível abrir o catálogo</h2>
          <p>Confira sua conexão e tente novamente.</p>
          <button className="ydo-btn-primary" type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="ydo-empty-state">
          <h2>Nenhum título encontrado</h2>
          <p>
            Não encontramos títulos para{" "}
            <strong>
              {decoded} {typeBadge ? `em ${typeBadge}` : ""}
            </strong>{" "}
            no momento.
          </p>
        </div>
      ) : (
        <>
          {fallback.length > 0 && (
            <p className="zf-genre-fallback" role="status">
              Nenhum título com o gênero exato foi identificado. Mostrando outras opções
              de {typeBadge?.toLowerCase() || "nosso catálogo"} enquanto o catálogo é atualizado.
            </p>
          )}
          <div className="ydo-search-grid">
            {visibleItems.map(item => (
              <MediaCard key={item.id} item={item}
                isSaved={savedIds.has(item.id)} onToggleSaved={toggleSaved} />
            ))}
          </div>
          <div className="zf-catalog-progress" aria-live="polite">
            <span>Exibindo {visibleItems.length} de {displayItems.length} títulos</span>
            {visibleItems.length < displayItems.length && (
              <button type="button" className="zf-catalog-load-more"
                onClick={() => setVisibleCount(current => nextCatalogPage(current, displayItems.length))}>
                Carregar mais títulos
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}

