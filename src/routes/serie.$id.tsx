import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, ArrowLeft, Star, Tv, Check, Plus, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/serie/$id")({
  component: SeriesDetailPage,
  head: () => ({ meta: [{ title: "Detalhes da Série — Zang Flix" }] }),
});

function SeriesDetailPage() {
  const { id } = Route.useParams();
  const [serie, setSerie] = useState<CatalogItem | null>(null);
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
        setSerie(found);
        setSaved(getSavedList().includes(found.id));
      })
      .catch(() => {
        fetch("/api/catalogo")
          .then((r) => r.json() as Promise<{ items: CatalogItem[] }>)
          .then((d) => {
            if (!active) return;
            const f = d.items.find((i) => i.id === id);
            setSerie(f || null);
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

  const cast = serie.tmdb?.cast || [];

  return (
    <main className="min-h-screen bg-[#0a0b14] text-[#f1f1f1] relative pb-20">
      <div
        className="absolute top-0 left-0 w-full h-[75vh] bg-cover bg-center opacity-30 blur-sm pointer-events-none"
        style={{
          backgroundImage: serie.tmdb?.backdropUrl
            ? `url(${serie.tmdb.backdropUrl})`
            : serie.posterUrl
            ? `url(${serie.posterUrl.replace("/w342", "/original")})`
            : "none",
        }}
      />
      <div className="absolute top-0 left-0 w-full h-[75vh] bg-gradient-to-b from-transparent via-[#0a0b14]/80 to-[#0a0b14] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 flex flex-col gap-12">
        <div className="flex flex-col md:flex-row gap-10 items-start">
          <div className="w-64 md:w-80 flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#111320] aspect-[2/3]">
            {serie.posterUrl ? (
              <img
                src={serie.posterUrl.replace("/w342", "/w780")}
                alt={serie.title}
                className="w-full h-full object-cover"
              />
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

            <div className="flex items-center gap-4 text-sm text-white/70">
              {serie.tmdb?.releaseYear && <span>{serie.tmdb.releaseYear}</span>}
              {serie.tmdb?.voteAverage ? (
                <span className="flex items-center gap-1 text-[#e8b44a] font-bold">
                  <Star size={15} fill="currentColor" /> {serie.tmdb.voteAverage.toFixed(1)} TMDB
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

        {/* Elenco */}
        {cast.length > 0 && (
          <div className="flex flex-col gap-4 pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 text-white font-bold text-xl">
              <Users size={20} className="text-[#e8b44a]" />
              <h2>Elenco da Série</h2>
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
