import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { isAnimeItem } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";
import { Sparkles, Tv } from "lucide-react";

export const Route = createFileRoute("/animes")({
  component: AnimesPage,
  head: () => ({ meta: [{ title: "Animes — Zang Flix" }] }),
});

const ANIME_GENRES = ["Todos", "Ação", "Fantasia", "Shounen", "Animação", "Aventura"];

function AnimesPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [selectedGenre, setSelectedGenre] = useState("Todos");

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
        const animes = (data.items || []).filter((i) => i.type === "a" || isAnimeItem(i));
        setItems(animes);
      })
      .catch((err) => console.error("Erro ao carregar animes:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (selectedGenre === "Todos") return items;
    return items.filter((i) =>
      i.genres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase())
    );
  }, [items, selectedGenre]);

  const toggleSaved = (id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  };

  return (
    <main className="ydo-search-page">
      <div className="ydo-search-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Sparkles size={28} style={{ color: "#e8b44a" }} />
          <h1>Animes</h1>
        </div>
        {!loading && <span className="ydo-search-count">{filtered.length} títulos</span>}
      </div>

      {/* Sub-nav em pílulas com filtros de gêneros de animes */}
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "16px", marginBottom: "24px" }}>
        {ANIME_GENRES.map((genre) => (
          <button
            key={genre}
            onClick={() => setSelectedGenre(genre)}
            style={{
              padding: "7px 16px",
              borderRadius: "999px",
              fontSize: "0.825rem",
              fontWeight: "700",
              cursor: "pointer",
              border: selectedGenre === genre ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: selectedGenre === genre ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
              color: selectedGenre === genre ? "#0a0b14" : "#ffffff",
              transition: "all 0.18s ease",
              whiteSpace: "nowrap",
            }}
          >
            {genre}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonRow count={12} />
      ) : filtered.length === 0 ? (
        <div className="ydo-empty-state">
          <Tv size={48} style={{ color: "rgba(232, 180, 74, 0.5)", margin: "0 auto 16px" }} />
          <h2>Catálogo de animes em preparação</h2>
          <p>Os títulos de animes estão sendo sincronizados. Volte em breve para novos lançamentos.</p>
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
