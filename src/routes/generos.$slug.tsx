import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { loadCatalog } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/generos/$slug")({
  component: GenrePage,
  head: ({ params }) => ({ meta: [{ title: `${params.slug} — Your Daily Oi` }] }),
});

function GenrePage() {
  const { slug } = Route.useParams();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const isFilmes = slug === "filmes";
  const isSeries = slug === "series";

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadCatalog()
      .then(({ items: mapItems }) => {
        if (!active) return;
        setItems(Array.from(mapItems.values()));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (isFilmes) return items.filter((i) => i.type === "f");
    if (isSeries) return items.filter((i) => i.type === "s");
    return items.filter((i) =>
      i.genres.some((g) => g.toLowerCase() === decodeURIComponent(slug).toLowerCase())
    );
  }, [items, slug, isFilmes, isSeries]);

  const pageTitle = isFilmes ? "Filmes" : isSeries ? "Séries" : decodeURIComponent(slug);

  const toggleSaved = (id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  };

  return (
    <main className="ydo-search-page">
      <div className="ydo-search-header">
        <h1>{pageTitle}</h1>
        {!loading && <span className="ydo-search-count">{filtered.length} títulos</span>}
      </div>

      {loading ? (
        <SkeletonRow count={12} />
      ) : filtered.length === 0 ? (
        <div className="ydo-empty-state">
          <h2>Nenhum título encontrado</h2>
          <p>Não encontramos títulos nesta categoria no momento.</p>
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
