import { getClientCatalog } from "@/lib/catalog-client";
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
  const [typedQuery, setTypedQuery] = useState(q);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  // Header navigation and browser history can change the URL after mount.
  useEffect(() => { setTypedQuery(q); }, [q]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    void getClientCatalog()
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
    if (!typedQuery.trim()) return items.slice(0, 60);
    const norm = normalizeTitle(typedQuery);
    return items.filter((item) => normalizeTitle(item.title).includes(norm)).slice(0, 60);
  }, [items, typedQuery]);

  const toggleSaved = (id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  };

  return (
    <main className="ydo-search-page">
      <div className="ydo-search-header">
        <Search size={20} aria-hidden />
        <h1>{typedQuery.trim() ? `Resultados para "${typedQuery.trim()}"` : "Explorar catálogo"}</h1>
        {!loading && <span className="ydo-search-count">{results.length} títulos</span>}
      </div>
      <div className="zf-search-page-field">
        <Search size={19} aria-hidden="true" />
        <input type="search" value={typedQuery}
          onChange={event => setTypedQuery(event.target.value)}
          placeholder="Pesquise por filmes, séries ou animes…"
          aria-label="Pesquisar no catálogo em tempo real"
          autoComplete="off" />
        <span>Resultados atualizados ao digitar</span>
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
