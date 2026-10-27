import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Search } from "lucide-react";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { normalizeTitle } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/busca")({
  validateSearch: (search: Record<string, unknown>) => ({ q: String(search["q"] ?? "") }),
  component: SearchPage,
  head: () => ({ meta: [{ title: "Busca — Zang Flix" }] }),
});

function SearchPage() {
  const { q } = Route.useSearch();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/catalogo")
      .then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<{ items: CatalogItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
      })
      .catch((err) => console.error("Erro na busca:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const results = useMemo(() => {
    if (!q.trim()) return items.slice(0, 60);
    const norm = normalizeTitle(q);
    return items.filter((item) => normalizeTitle(item.title).includes(norm)).slice(0, 60);
  }, [items, q]);

  const toggleSaved = (id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  };

  return (
    <main className="ydo-search-page">
      <div className="ydo-search-header">
        <Search size={20} aria-hidden />
        <h1>{q ? `Resultados para "${q}"` : "Explorar catálogo"}</h1>
        {!loading && <span className="ydo-search-count">{results.length} títulos</span>}
      </div>

      {loading ? (
        <SkeletonRow count={12} />
      ) : results.length === 0 ? (
        <div className="ydo-empty-state">
          <Search size={40} aria-hidden />
          <h2>Nenhum resultado encontrado</h2>
          <p>Tente buscar com termos diferentes ou menos específicos.</p>
        </div>
      ) : (
        <div className="ydo-search-grid">
          {results.map((item) => (
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
