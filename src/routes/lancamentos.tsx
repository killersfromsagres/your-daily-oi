import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { loadCatalog } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/lancamentos")({
  component: LaunchesPage,
  head: () => ({ meta: [{ title: "Lançamentos — Your Daily Oi" }] }),
});

function LaunchesPage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadCatalog()
      .then(({ items: mapItems }) => {
        if (!active) return;
        const list = Array.from(mapItems.values());
        // Ordena pelos mais recentes (ano TMDB decrescente)
        const sorted = [...list].sort(
          (a, b) => (b.tmdb?.releaseYear ?? 0) - (a.tmdb?.releaseYear ?? 0)
        );
        setItems(sorted.slice(0, 60));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const toggleSaved = (id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  };

  return (
    <main className="ydo-search-page">
      <div className="ydo-search-header">
        <h1>Lançamentos</h1>
        {!loading && <span className="ydo-search-count">{items.length} títulos</span>}
      </div>

      {loading ? (
        <SkeletonRow count={12} />
      ) : (
        <div className="ydo-search-grid">
          {items.map((item) => (
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
