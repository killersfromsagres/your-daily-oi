import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { HeroSection } from "@/components/catalog/HeroSection";
import { MediaRow } from "@/components/catalog/MediaRow";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import { ContinueWatchingRow } from "@/components/catalog/ContinueWatchingRow";
import type { CatalogItem, HighlightRow, WatchProgress } from "@/lib/types";
import { cleanDisplayTitle } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage, getProgress, removeProgress } from "@/lib/storage";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Zang Flix — Filmes, Séries, Animes e Doramas" },
      {
        name: "description",
        content:
          "Zang Flix reúne filmes, séries, animes e TV ao vivo em uma experiência cinematográfica completa e fluida.",
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
  const [catalogDegraded, setCatalogDegraded] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [continueWatching, setContinueWatching] = useState<WatchProgress[]>([]);

  useEffect(() => {
    setSavedIds(new Set(getSavedList()));
    setContinueWatching(getProgress());
  }, []);

  const handleRemoveProgress = (id: string) => {
    removeProgress(id);
    setContinueWatching(getProgress());
  };

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
          sourceStatus?: { state: "remote" | "fallback" | "uninitialized"; checkedAt: string | null };
        }>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setHighlights(data.highlights);
        setGenres(data.genres);
        setCatalogDegraded(data.sourceStatus?.state === "fallback");
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

  // Recalculate expensive catalog grouping only when the payload changes.
  // Especially important for lower-memory mobile browsers and My List updates.
  const heroItems = useMemo(() => {
    const source = featuredHero.length > 0
      ? featuredHero
      : items.filter(it => Boolean(it.tmdb?.backdropUrl) && !it.title.startsWith("#"));
    return source.slice(0, 8).map(item => ({
      id: item.id,
      type: item.type,
      title: cleanDisplayTitle(item.title),
      overview: item.tmdb?.overview,
      backdropUrl: item.tmdb?.backdropUrl || null,
      posterUrl: item.posterUrl,
      genres: item.genres,
      releaseYear: item.tmdb?.releaseYear,
      voteAverage: item.tmdb?.voteAverage,
      hasDub: item.streams.some(stream => stream.audio === "dub"),
      hasLeg: item.streams.some(stream => stream.audio === "leg"),
      quality: item.streams.some(stream => stream.quality?.includes("4K"))
        ? "4K ULTRA HD"
        : item.streams.some(stream => stream.quality?.includes("2K"))
          ? "2K QUAD HD" : "FULL HD",
    }));
  }, [featuredHero, items]);

  const rows = useMemo(() => {
    const result: Array<{
      title: string;
      eyebrow: string;
      items: CatalogItem[];
      ranked?: boolean;
    }> = [];
    // Previous highlights used repeated items.find(), which caused O(N x M)
    // work on every render with large catalog lists.
    const byName = new Map<string, CatalogItem>();
    const byTypedName = new Map<string, CatalogItem>();
    for (const item of items) {
      const name = item.title.toLowerCase();
      if (!byName.has(name)) byName.set(name, item);
      const key = item.type + ":" + name;
      if (!byTypedName.has(key)) byTypedName.set(key, item);
    }
    for (const highlight of highlights) {
      const seen = new Set<string>();
      const matched: CatalogItem[] = [];
      for (const entry of highlight.items) {
        const name = entry.title.toLowerCase();
        const match = (entry.type ? byTypedName.get(entry.type + ":" + name) : undefined)
          || byName.get(name);
        if (match && !seen.has(match.id)) {
          seen.add(match.id);
          matched.push(match);
        }
      }
      if (matched.length) {
        result.push({ title: highlight.rowName, eyebrow: "Em Destaque", items: matched });
      }
    }
    const topRated = [...items]
      .filter(item => item.tmdb?.voteAverage)
      .sort((a, b) => (b.tmdb?.voteAverage ?? 0) - (a.tmdb?.voteAverage ?? 0))
      .slice(0, 18);
    if (topRated.length) {
      result.unshift({ title: "Mais Bem Avaliados", eyebrow: "Top 10 TMDB", items: topRated, ranked: true });
    }
    for (const genre of genres.slice(0, 6)) {
      const genreItems = items.filter(item => item.genres.includes(genre)).slice(0, 18);
      if (genreItems.length) result.push({ title: genre, eyebrow: "Gênero", items: genreItems });
    }
    return result;
  }, [items, highlights, genres]);

  return (
    <main className="ydo-home">
      {catalogDegraded && !loading && (
        <div role="status" style={{ padding: "12px 20px", margin: "16px auto", maxWidth: 1200, borderRadius: 10, background: "rgba(245,158,11,0.12)", color: "inherit" }}>
          O catálogo remoto de filmes e séries não respondeu. Exibindo o acervo local disponível.
          {" "}<a href="/api/integrations/status" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Ver status das integrações</a>
        </div>
      )}
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
        {continueWatching.length > 0 && (
          <ContinueWatchingRow
            items={continueWatching}
            onRemove={handleRemoveProgress}
          />
        )}
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
