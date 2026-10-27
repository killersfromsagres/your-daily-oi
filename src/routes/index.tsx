import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { HeroSection } from "@/components/catalog/HeroSection";
import { MediaRow } from "@/components/catalog/MediaRow";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem, HighlightRow } from "@/lib/types";
import { loadCatalog, getGenres } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Your Daily Oi — Filmes, Séries, Animes e Doramas" },
      {
        name: "description",
        content:
          "Plataforma completa de streaming em português consumindo o catálogo público Saimo TV, com player HLS nativo e metadados TMDB.",
      },
      { property: "og:title", content: "Your Daily Oi — Cinema e Séries" },
      {
        property: "og:description",
        content:
          "Filmes, séries, animes e doramas com reprodução contínua, seleção de fontes e design cinematográfico.",
      },
    ],
  }),
});

function HomePage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    loadCatalog()
      .then(({ items: mapItems, highlights: hls }) => {
        if (!active) return;
        const itemList = Array.from(mapItems.values());
        setItems(itemList);
        setHighlights(hls);
        setGenres(getGenres(mapItems));
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar o catálogo");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const toggleSaved = useCallback((id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  }, []);

  // Prepara itens de destaque para o herói
  const heroItems = items
    .filter((item) => item.posterUrl || item.tmdb?.backdropUrl)
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      overview: item.tmdb?.overview,
      backdropUrl: item.tmdb?.backdropUrl,
      posterUrl: item.posterUrl,
      genres: item.genres,
      releaseYear: item.tmdb?.releaseYear,
      voteAverage: item.tmdb?.voteAverage,
      hasDub: item.streams.some((s) => s.audio === "dub"),
      hasLeg: item.streams.some((s) => s.audio === "leg"),
    }));

  // Monta as fileiras da home
  const rows: Array<{
    title: string;
    eyebrow: string;
    items: CatalogItem[];
    ranked?: boolean;
  }> = [];

  // Fileiras definidas em destaques.txt
  for (const hl of highlights.slice(0, 5)) {
    const rowItems = hl.items
      .map((h) => items.find((item) => item.title.toLowerCase() === h.title.toLowerCase()))
      .filter((x): x is CatalogItem => !!x);
    if (rowItems.length > 0) {
      rows.push({ title: hl.rowName, eyebrow: "Em Destaque", items: rowItems });
    }
  }

  // Melhores avaliados / Mais populares
  const topRated = [...items]
    .filter((i) => i.tmdb?.voteAverage)
    .sort((a, b) => (b.tmdb?.voteAverage ?? 0) - (a.tmdb?.voteAverage ?? 0))
    .slice(0, 18);

  if (topRated.length > 0) {
    rows.unshift({
      title: "Mais Bem Avaliados",
      eyebrow: "Top 10 Brasil",
      items: topRated,
      ranked: true,
    });
  }

  // Fileiras por gêneros principais
  for (const genre of genres.slice(0, 6)) {
    const genreItems = items.filter((item) => item.genres.includes(genre)).slice(0, 18);
    if (genreItems.length > 0) {
      rows.push({ title: genre, eyebrow: "Gênero", items: genreItems });
    }
  }

  return (
    <main className="ydo-home">
      {loading ? (
        <div className="ydo-hero-skeleton skeleton" aria-label="Carregando catálogo..." />
      ) : error ? (
        <div className="ydo-hero-error">
          <h2>Não foi possível carregar o acervo</h2>
          <p>{error}</p>
          <button className="ydo-btn-primary" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <HeroSection items={heroItems} savedIds={savedIds} onToggleSaved={toggleSaved} />
      )}

      <div className="ydo-catalog">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          : rows.map((row) => (
              <MediaRow
                key={row.title}
                title={row.title}
                eyebrow={row.eyebrow}
                items={row.items}
                savedIds={savedIds}
                onToggleSaved={toggleSaved}
                ranked={row.ranked}
              />
            ))}
      </div>
    </main>
  );
}
