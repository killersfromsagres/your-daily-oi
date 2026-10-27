import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, ArrowLeft, Star, Tv, Check, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
import { loadCatalog } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/serie/$id")({
  component: SeriesDetailPage,
  head: () => ({ meta: [{ title: "Detalhes da Série — Your Daily Oi" }] }),
});

function SeriesDetailPage() {
  const { id } = Route.useParams();
  const [serie, setSerie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadCatalog()
      .then(({ items }) => {
        if (!active) return;
        const found = items.get(id) || Array.from(items.values()).find((i) => i.id === id);
        setSerie(found || null);
        if (found) {
          setSaved(getSavedList().includes(found.id));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const toggleSave = () => {
    if (!serie) return;
    toggleSavedStorage(serie.id);
    setSaved(!saved);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex items-center justify-center">
        <div className="skeleton w-3/4 h-[70vh] rounded-2xl" />
      </main>
    );
  }

  if (!serie) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex flex-col items-center justify-center gap-4 text-center px-4">
        <Tv size={48} className="text-[#e8b44a]" />
        <h1 className="text-2xl font-bold text-white">Série não localizada</h1>
        <p className="text-white/60">A série solicitada não faz parte do catálogo atual.</p>
        <Link to="/" className="ydo-btn-secondary mt-2">
          <ArrowLeft size={16} /> Voltar ao Início
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0b14] text-[#f1f1f1] relative pb-16">
      {/* Backdrop de fundo */}
      <div
        className="absolute top-0 left-0 w-full h-[70vh] bg-cover bg-center opacity-30 blur-sm pointer-events-none"
        style={{
          backgroundImage: serie.tmdb?.backdropUrl
            ? `url(${serie.tmdb.backdropUrl})`
            : serie.posterUrl
            ? `url(${serie.posterUrl})`
            : "none",
        }}
      />
      <div className="absolute top-0 left-0 w-full h-[70vh] bg-gradient-to-b from-transparent via-[#0a0b14]/80 to-[#0a0b14] pointer-events-none" />

      {/* Conteúdo */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-28 flex flex-col md:flex-row gap-10 items-start">
        <div className="w-64 md:w-80 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#111320] aspect-[2/3]">
          {serie.posterUrl ? (
            <img src={serie.posterUrl} alt={serie.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-white/30">
              SEM PÔSTER
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="ydo-hero-badge ydo-hero-badge-type">SÉRIE</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">{serie.title}</h1>

          <div className="flex items-center gap-4 text-sm text-white/60">
            {serie.tmdb?.releaseYear && <span>{serie.tmdb.releaseYear}</span>}
            {serie.tmdb?.voteAverage ? (
              <span className="flex items-center gap-1 text-[#e8b44a] font-semibold">
                <Star size={14} fill="currentColor" /> {serie.tmdb.voteAverage.toFixed(1)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 my-1">
            {serie.genres.map((genre) => (
              <span
                key={genre}
                className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80"
              >
                {genre}
              </span>
            ))}
          </div>

          <p className="text-white/80 text-base leading-relaxed max-w-2xl">
            {serie.tmdb?.overview || "Sinopse em atualização via catálogo Saimo TV."}
          </p>

          <div className="flex items-center gap-4 mt-4">
            <Link to={`/assistir/serie/${serie.id}/1/1`} className="ydo-btn-primary">
              <Play size={20} fill="currentColor" />
              Assistir T1 : E1
            </Link>
            <button onClick={toggleSave} className="ydo-btn-secondary">
              {saved ? <Check size={18} /> : <Plus size={18} />}
              {saved ? "Na Minha Lista" : "Minha Lista"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
