import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Tv, Play } from "lucide-react";
import { HeroSection } from "@/components/catalog/HeroSection";
import { MediaRow } from "@/components/catalog/MediaRow";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem, HighlightRow } from "@/lib/types";
import type { LiveChannel } from "@/lib/live-types";
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
  const [liveChannels, setLiveChannels] = useState<LiveChannel[]>([]);
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

    // Carrega dados da rota de API do servidor (/api/catalogo)
    fetch("/api/catalogo")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          items: CatalogItem[];
          highlights: HighlightRow[];
          genres: string[];
        }>;
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setHighlights(data.highlights);
        setGenres(data.genres);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar o catálogo");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Carrega canais ao vivo em paralelo para a fileira "Ao Vivo Agora"
    fetch("/api/canais")
      .then((r) => r.json() as Promise<{ canais: LiveChannel[] }>)
      .then((d) => {
        if (active && d.canais) {
          setLiveChannels(d.canais.slice(0, 10));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const toggleSaved = useCallback((id: string) => {
    toggleSavedStorage(id);
    setSavedIds(new Set(getSavedList()));
  }, []);

  // Prepara itens de destaque para o carrossel HD
  // Prioriza itens dos destaques que possuem backdrop TMDB ou pôster em alta definição
  const highlightTitles = new Set(
    highlights.flatMap((h) => h.items.map((it) => it.title.toLowerCase()))
  );

  const heroCandidates = items.filter(
    (item) =>
      highlightTitles.has(item.title.toLowerCase()) ||
      Boolean(item.tmdb?.backdropUrl)
  );

  const heroItems = (heroCandidates.length > 0 ? heroCandidates : items)
    .slice(0, 7)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
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
        {/* Fileira "Ao Vivo Agora" com canais em destaque */}
        {liveChannels.length > 0 && (
          <section className="mb-10 px-4 md:px-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e8b44a] animate-ping" />
                <h2 className="text-xl md:text-2xl font-black text-white">Ao Vivo Agora</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#e8b44a]/15 text-[#e8b44a] font-bold border border-[#e8b44a]/30">
                  408 Canais
                </span>
              </div>
              <Link to="/ao-vivo" className="text-xs font-bold text-[#e8b44a] hover:underline flex items-center gap-1">
                Ver todos os canais →
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
              {liveChannels.map((ch) => (
                <Link
                  key={ch.id}
                  to="/ao-vivo"
                  className="group p-3.5 rounded-xl bg-[#111320] border border-white/5 hover:border-[#e8b44a]/50 hover:bg-[#151728] transition-all flex items-center gap-3 shadow-md"
                >
                  <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center p-1 overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                    {ch.logo ? (
                      <img src={ch.logo} alt={ch.nome} className="w-full h-full object-contain" />
                    ) : (
                      <Tv size={20} className="text-[#e8b44a]" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <span className="block text-sm font-bold text-white group-hover:text-[#e8b44a] truncate transition-colors">
                      {ch.nome}
                    </span>
                    <span className="block text-[11px] text-white/50 truncate">
                      {ch.categoria}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
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
