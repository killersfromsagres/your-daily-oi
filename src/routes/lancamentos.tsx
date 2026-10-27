import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/lancamentos")({
  component: LaunchesPage,
  head: () => ({ meta: [{ title: "Lançamentos — Zang Flix" }] }),
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

    fetch("/api/catalogo", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<{ items: CatalogItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        const list = data.items || [];
        // Ordena pelos mais recentes (ano TMDB decrescente)
        const sorted = [...list].sort(
          (a, b) => (b.tmdb?.releaseYear ?? 0) - (a.tmdb?.releaseYear ?? 0)
        );
        setItems(sorted.slice(0, 60));
      })
      .catch((err) => console.error("Erro ao carregar lançamentos:", err))
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
