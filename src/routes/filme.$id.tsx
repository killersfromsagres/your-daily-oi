import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, ArrowLeft, Star, Film, Check, Plus, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
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

    fetch(`/api/item?id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<CatalogItem>;
      })
      .then((found) => {
        if (!active) return;
        setMovie(found);
        setSaved(getSavedList().includes(found.id));
      })
      .catch(() => {
        fetch("/api/catalogo")
          .then((r) => r.json() as Promise<{ items: CatalogItem[] }>)
          .then((d) => {
            if (!active) return;
            const f = d.items.find((i) => i.id === id);
            setMovie(f || null);
            if (f) setSaved(getSavedList().includes(f.id));
          })
          .catch(() => {});
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
  const cast = movie.tmdb?.cast || [];

  return (
    <main className="min-h-screen bg-[#0a0b14] text-[#f1f1f1] relative pb-20">
      {/* Backdrop de fundo em Alta Definição */}
      <div
        className="absolute top-0 left-0 w-full h-[75vh] bg-cover bg-center opacity-30 blur-sm pointer-events-none"
        style={{
          backgroundImage: movie.tmdb?.backdropUrl
            ? `url(${movie.tmdb.backdropUrl})`
            : movie.posterUrl
            ? `url(${movie.posterUrl.replace("/w342", "/original")})`
            : "none",
        }}
      />
      <div className="absolute top-0 left-0 w-full h-[75vh] bg-gradient-to-b from-transparent via-[#0a0b14]/80 to-[#0a0b14] pointer-events-none" />

      {/* Conteúdo do detalhe */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 flex flex-col gap-12">
        <div className="flex flex-col md:flex-row gap-10 items-start">
          {/* Pôster em alta qualidade */}
          <div className="w-64 md:w-80 flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#111320] aspect-[2/3]">
            {movie.posterUrl ? (
              <img
                src={movie.posterUrl.replace("/w342", "/w780")}
                alt={movie.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-white/30">
                SEM PÔSTER
              </div>
            )}
          </div>

          {/* Informações principais */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              {hasDub && <span className="ydo-hero-badge">DUBLADO</span>}
              {hasLeg && <span className="ydo-hero-badge ydo-hero-badge-leg">LEGENDADO</span>}
              <span className="ydo-hero-badge ydo-hero-badge-type">FILME</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">{movie.title}</h1>

            <div className="flex items-center gap-4 text-sm text-white/70">
              {movie.tmdb?.releaseYear && <span>{movie.tmdb.releaseYear}</span>}
              {movie.tmdb?.voteAverage ? (
                <span className="flex items-center gap-1 text-[#e8b44a] font-bold">
                  <Star size={15} fill="currentColor" /> {movie.tmdb.voteAverage.toFixed(1)} TMDB
                </span>
              ) : null}
              <span className="text-white/40">•</span>
              <span>{movie.streams.length} servidores</span>
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

            {/* Ações */}
            <div className="flex items-center gap-4 mt-4">
              <Link to={`/assistir/filme/${movie.id}`} className="ydo-btn-primary">
                <Play size={20} fill="currentColor" />
                Assistir Filme
              </Link>
              <button onClick={toggleSave} className="ydo-btn-secondary">
                {saved ? <Check size={18} /> : <Plus size={18} />}
                {saved ? "Na Minha Lista" : "Minha Lista"}
              </button>
            </div>
          </div>
        </div>

        {/* Elenco / Créditos TMDB */}
        {cast.length > 0 && (
          <div className="flex flex-col gap-4 pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 text-white font-bold text-xl">
              <Users size={20} className="text-[#e8b44a]" />
              <h2>Elenco Principal</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {cast.map((actor) => (
                <div
                  key={actor.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                    {actor.profilePath ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                        alt={actor.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs text-white/30">
                        {actor.name.slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <span className="block text-sm font-semibold text-white truncate">
                      {actor.name}
                    </span>
                    <span className="block text-xs text-white/50 truncate">
                      {actor.character}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
