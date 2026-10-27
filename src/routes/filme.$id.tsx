import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, ArrowLeft, Star, Film, Check, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
import { loadCatalog } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/filme/$id")({
  component: MovieDetailPage,
  head: () => ({ meta: [{ title: "Detalhes do Filme — Zang Flix" }] }),
});

function MovieDetailPage() {
  const { id } = Route.useParams();
  const [movie, setMovie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadCatalog()
      .then(({ items }) => {
        if (!active) return;
        const found = items.get(id) || Array.from(items.values()).find((i) => i.id === id);
        setMovie(found || null);
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
    if (!movie) return;
    toggleSavedStorage(movie.id);
    setSaved(!saved);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex items-center justify-center">
        <div className="skeleton w-3/4 h-[70vh] rounded-2xl" />
      </main>
    );
  }

  if (!movie) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex flex-col items-center justify-center gap-4 text-center px-4">
        <Film size={48} className="text-[#e8b44a]" />
        <h1 className="text-2xl font-bold text-white">Título não localizado</h1>
        <p className="text-white/60">O filme solicitado não faz parte do catálogo atual.</p>
        <Link to="/" className="ydo-btn-secondary mt-2">
          <ArrowLeft size={16} /> Voltar ao Início
        </Link>
      </main>
    );
  }

  const hasDub = movie.streams.some((s) => s.audio === "dub");
  const hasLeg = movie.streams.some((s) => s.audio === "leg");

  return (
    <main className="min-h-screen bg-[#0a0b14] text-[#f1f1f1] relative pb-16">
      {/* Backdrop de fundo */}
      <div
        className="absolute top-0 left-0 w-full h-[70vh] bg-cover bg-center opacity-30 blur-sm pointer-events-none"
        style={{
          backgroundImage: movie.tmdb?.backdropUrl
            ? `url(${movie.tmdb.backdropUrl})`
            : movie.posterUrl
            ? `url(${movie.posterUrl})`
            : "none",
        }}
      />
      <div className="absolute top-0 left-0 w-full h-[70vh] bg-gradient-to-b from-transparent via-[#0a0b14]/80 to-[#0a0b14] pointer-events-none" />

      {/* Conteúdo do detalhe */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-28 flex flex-col md:flex-row gap-10 items-start">
        {/* Pôster */}
        <div className="w-64 md:w-80 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#111320] aspect-[2/3]">
          {movie.posterUrl ? (
            <img src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-white/30">
              SEM PÔSTER
            </div>
          )}
        </div>

        {/* Informações */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {hasDub && <span className="ydo-hero-badge">DUBLADO</span>}
            {hasLeg && <span className="ydo-hero-badge ydo-hero-badge-leg">LEGENDADO</span>}
            <span className="ydo-hero-badge ydo-hero-badge-type">FILME</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">{movie.title}</h1>

          <div className="flex items-center gap-4 text-sm text-white/60">
            {movie.tmdb?.releaseYear && <span>{movie.tmdb.releaseYear}</span>}
            {movie.tmdb?.voteAverage ? (
              <span className="flex items-center gap-1 text-[#e8b44a] font-semibold">
                <Star size={14} fill="currentColor" /> {movie.tmdb.voteAverage.toFixed(1)}
              </span>
            ) : null}
            <span>{movie.streams.length} fontes disponíveis</span>
          </div>

          <div className="flex flex-wrap gap-2 my-1">
            {movie.genres.map((genre) => (
              <span
                key={genre}
                className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80"
              >
                {genre}
              </span>
            ))}
          </div>

          <p className="text-white/80 text-base leading-relaxed max-w-2xl">
            {movie.tmdb?.overview || "Sinopse em atualização via catálogo Saimo TV."}
          </p>

          {/* Botões de Ação */}
          <div className="flex items-center gap-4 mt-4">
            <Link to={`/assistir/filme/${movie.id}`} className="ydo-btn-primary">
              <Play size={20} fill="currentColor" />
              Assistir Agora
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
