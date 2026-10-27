import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { normalizeTitle, isAnimeItem } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";
import { Film, Tv, Sparkles, Filter } from "lucide-react";

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

  const decoded = decodeURIComponent(slug);
  const normSlug = normalizeTitle(decoded);
  const isFilmes = normSlug === "filmes";
  const isSeries = normSlug === "series";

  // tipo da URL ou estado selecionado
  const [selectedType, setSelectedType] = useState<string>(
    search.tipo || (isFilmes ? "f" : isSeries ? "s" : "todos")
  );

  useEffect(() => {
    if (search.tipo) {
      setSelectedType(search.tipo);
    } else if (isFilmes) {
      setSelectedType("f");
    } else if (isSeries) {
      setSelectedType("s");
    }
  }, [search.tipo, isFilmes, isSeries]);

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/catalogo", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<{ items: CatalogItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
      })
      .catch((err) => console.error("Erro ao carregar catálogo:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Filtra itens com separação estrita entre filmes, séries e animes
  const filtered = useMemo(() => {
    let base = items;

    // 1. Filtragem estrita por tipo
    if (selectedType === "s" || selectedType === "serie" || selectedType === "series" || isSeries) {
      base = base.filter((i) => i.type === "s");
    } else if (selectedType === "f" || selectedType === "filme" || selectedType === "filmes" || isFilmes) {
      base = base.filter((i) => i.type === "f");
    } else if (selectedType === "a" || selectedType === "anime" || selectedType === "animes") {
      base = base.filter((i) => i.type === "a" || isAnimeItem(i));
    }

    // Se a rota for exatamente /generos/filmes ou /generos/series, já retorna
    if (isFilmes || isSeries) return base;

    // 2. Filtragem pelo gênero específico
    return base.filter((i) =>
      i.genres.some((g) => {
        const normGenre = normalizeTitle(g);
        return normGenre === normSlug || normGenre.includes(normSlug) || normSlug.includes(normGenre);
      })
    );
  }, [items, normSlug, isFilmes, isSeries, selectedType]);

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
    setSelectedType(newType);
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
              <Tv size={26} style={{ color: "#e8b44a" }} />
            ) : selectedType === "a" ? (
              <Sparkles size={26} style={{ color: "#e8b44a" }} />
            ) : (
              <Film size={26} style={{ color: "#e8b44a" }} />
            )}
            <h1>{pageTitle}</h1>
          </div>
          <span style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.55)" }}>
            Catálogo completo e exclusivo Zang Flix
          </span>
        </div>
        {!loading && <span className="ydo-search-count">{filtered.length} títulos</span>}
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
            <Tv size={13} />
            Apenas Séries
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonRow count={12} />
      ) : filtered.length === 0 ? (
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
        <div className="ydo-search-grid">
          {filtered.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              isSaved={savedIds.has(item.id)}
              onToggleSaved={toggleSaved}
            />
          ))}
        </div>
      )}
    </main>
  );
}

