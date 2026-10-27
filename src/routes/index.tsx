import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { HeroSection } from "@/components/catalog/HeroSection";
import { MediaRow } from "@/components/catalog/MediaRow";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem, HighlightRow } from "@/lib/types";
import { cleanDisplayTitle } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Zang Flix — Filmes, Séries, Animes e Doramas" },
      {
        name: "description",
        content:
          "Zang Flix reúne filmes e séries em uma experiência cinematográfica completa e fluida, consumindo o catálogo oficial Saimo TV.",
      },
      { property: "og:title", content: "Zang Flix — Cinema e Séries" },
      {
        property: "og:description",
        content:
          "Assista a filmes e séries com direção de arte premium, múltiplos servidores e reprodução contínua.",
      },
    ],
  }),
});

function HomePage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [featuredHero, setFeaturedHero] = useState<CatalogItem[]>([]);
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

    // Carrega dados da rota de API do servidor (/api/catalogo) sem cache estático
    fetch("/api/catalogo", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          items: CatalogItem[];
          highlights: HighlightRow[];
          genres: string[];
          featuredHero?: CatalogItem[];
        }>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setHighlights(data.highlights);
        setGenres(data.genres);
        if (data.featuredHero && data.featuredHero.length > 0) {
          setFeaturedHero(data.featuredHero);
        }
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

  // Prepara exclusivamente os filmes mais assistidos para o carrossel HD / 4K
  const heroSource = featuredHero.length > 0 ? featuredHero : items.filter((it) => Boolean(it.tmdb?.backdropUrl) && !it.title.startsWith("#"));

  const heroItems = heroSource
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: cleanDisplayTitle(item.title),
      overview: item.tmdb?.overview,
      backdropUrl: item.tmdb?.backdropUrl || null,
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

  // Fileiras dos destaques.txt (Em alta, Séries em alta, etc)
  for (const hl of highlights) {
    const rowItems = hl.items
      .map((h) => items.find((item) => item.title.toLowerCase() === h.title.toLowerCase()))
      .filter((x): x is CatalogItem => !!x);
    if (rowItems.length > 0) {
      rows.push({ title: hl.rowName, eyebrow: "Em Destaque", items: rowItems });
    }
  }

  // Melhores avaliados
  const topRated = [...items]
    .filter((i) => i.tmdb?.voteAverage)
    .sort((a, b) => (b.tmdb?.voteAverage ?? 0) - (a.tmdb?.voteAverage ?? 0))
    .slice(0, 18);

  if (topRated.length > 0) {
    rows.unshift({
      title: "Mais Bem Avaliados",
      eyebrow: "Top 10 TMDB",
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
