import { getClientCatalog } from "@/lib/catalog-client";
import { useFriday13Edition } from "@/components/catalog/Friday13Edition";
import { selectFriday13Movies } from "@/lib/friday13-edition";
import { selectZangsPicks } from "@/lib/zangs-picks";
import { ZangsPicks } from "@/components/catalog/ZangsPicks";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { MobileCatalogFilters } from "@/components/catalog/MobileCatalogFilters";
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
  const friday13 = useFriday13Edition();
  const [friday13Hero,setFriday13Hero] = useState<CatalogItem[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [featuredHero, setFeaturedHero] = useState<CatalogItem[]>([]);
  const lastHeroRefresh = useRef(0);
  const initialCatalogLoaded = useRef(false);
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
    void getClientCatalog()
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setHighlights(data.highlights);
        setGenres(data.genres);
        setFriday13Hero(Array.isArray(data.friday13Hero) ? data.friday13Hero : []);
        setCatalogDegraded(data.sourceStatus?.state === "fallback");
        if (data.featuredHero && data.featuredHero.length > 0) {
          setFeaturedHero(data.featuredHero);
        }
        initialCatalogLoaded.current = true;
        lastHeroRefresh.current = Date.now();
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

  // A página continua interativa durante a atualização. Apenas os oito
  // destaques são buscados, sem transferir todo o catálogo novamente.
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (!initialCatalogLoaded.current || document.visibilityState !== "visible" ||
        (typeof navigator.onLine === "boolean" && !navigator.onLine)) return;
      const now = Date.now();
      if (now - lastHeroRefresh.current < 8 * 60_000) return;
      lastHeroRefresh.current = now;
      try {
        const response = await fetch("/api/destaques", { cache:"no-store", signal:controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { featuredHero?: CatalogItem[]; friday13Hero?: CatalogItem[] };
        if (controller.signal.aborted || !Array.isArray(data.featuredHero) || !data.featuredHero.length) return;
        setFriday13Hero(Array.isArray(data.friday13Hero) ? data.friday13Hero : []);
        setFeaturedHero(previous => {
          const latest = data.featuredHero!;
          return previous.length === latest.length &&
            previous.every((item, index) => item.id === latest[index]?.id)
            ? previous : latest;
        });
      } catch {
        // A lista atual segue funcional se o provedor estiver indisponível.
      }
    };
    const timer = window.setInterval(() => { void refresh(); }, 5 * 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, []);

  const toggleSaved = useCallback((id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  }, []);

  // Recalculate expensive catalog grouping only when the payload changes.
  // Especially important for lower-memory mobile browsers and My List updates.
  const friday13Movies = useMemo(() => selectFriday13Movies(items),[items]);
  const zangsPicks = useMemo(() => selectZangsPicks(items),[items]);
  const heroItems = useMemo(() => {
    const regularSource = featuredHero.length > 0
      ? featuredHero
      : items.filter(it => Boolean(it.tmdb?.backdropUrl) && !it.title.startsWith("#"));
    const source = friday13 && friday13Movies.length
      ? (friday13Hero.length ? friday13Hero : friday13Movies)
      : regularSource;
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
          ? "2K QUAD HD" : item.streams.find(stream => /^(1080p|720p|480p)$/i.test(stream.quality || ""))?.quality || "AUTO",
    }));
  }, [featuredHero, items, friday13, friday13Movies, friday13Hero]);

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
        <HeroSection items={heroItems} savedIds={savedIds} onToggleSaved={toggleSaved}
          edition={friday13 && friday13Movies.length ? "friday13" : undefined} />
      )}

      <div className="ydo-catalog">
        <MobileCatalogFilters kind={null} home/>
        {friday13 && friday13Movies.length > 0 && !loading && (
          <section className="zf-friday13-collection" aria-label="Maratona Sexta-feira 13">
            <MediaRow title="Não olhe para trás."
              eyebrow="A coleção Sexta-feira 13 · Especial de hoje"
              items={friday13Movies} savedIds={savedIds} onToggleSaved={toggleSaved}/>
            <div className="zf-friday13-collection-footer">
              <p>Crystal Lake espera por você.<br/>Edição estendida até 03h de 14/11, horário de Brasília.</p>
              <Link to="/generos/$slug" params={{slug:"terror"}} search={{tipo:"f"}} preload={false}>Explorar mais terror</Link>
            </div>
          </section>
        )}
        {!loading && <ZangsPicks items={zangsPicks} savedIds={savedIds} onToggleSaved={toggleSaved}/>}
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
