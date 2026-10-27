import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Film, RefreshCw, Star, Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import type { CatalogItem } from "@/lib/types";
import { saveProgress, getProgressById } from "@/lib/storage";

export const Route = createFileRoute("/assistir/filme/$id")({
  component: WatchMoviePage,
  head: () => ({ meta: [{ title: "Assistir Filme — Zang Flix" }] }),
});

function WatchMoviePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/item?id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao buscar filme");
        return res.json() as Promise<CatalogItem>;
      })
      .then((found) => {
        if (!active) return;
        setMovie(found);
      })
      .catch(() => {
        // Fallback local se rota falhar
        fetch("/api/catalogo")
          .then((r) => r.json() as Promise<{ items: CatalogItem[] }>)
          .then((d) => {
            if (!active) return;
            const f = d.items.find((i) => i.id === id);
            setMovie(f || null);
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

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex flex-col items-center justify-center text-white px-4">
        <div className="w-full max-w-5xl aspect-video rounded-2xl skeleton" />
        <span className="mt-4 text-white/50 text-sm">Carregando player cinematográfico...</span>
      </main>
    );
  }

  if (!movie || movie.streams.length === 0) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex flex-col items-center justify-center gap-4 text-center px-4">
        <Film size={48} className="text-[#e8b44a]" />
        <h1 className="text-2xl font-bold text-white">Stream indisponível</h1>
        <p className="text-white/60">Não encontramos fontes ativas para este filme no catálogo.</p>
        <Link to="/" className="ydo-btn-secondary mt-2">
          <ArrowLeft size={16} /> Voltar ao Início
        </Link>
      </main>
    );
  }

  const savedProgress = getProgressById(movie.id);

  const handleTimeUpdate = (currentTime: number) => {
    saveProgress({
      id: movie.id,
      type: "f",
      title: movie.title,
      posterUrl: movie.posterUrl,
      currentTime,
      duration: 0,
      updatedAt: Date.now(),
    });
  };

  return (
    <main className="min-h-screen bg-[#0a0b14] text-white flex flex-col justify-center items-center px-4 md:px-10 py-24 relative overflow-hidden">
      {/* Backdrop de ambiência no fundo do player */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15 filter blur-3xl pointer-events-none scale-110"
        style={{
          backgroundImage: movie.tmdb?.backdropUrl
            ? `url(${movie.tmdb.backdropUrl})`
            : movie.posterUrl
            ? `url(${movie.posterUrl})`
            : "none",
        }}
      />

      <div className="w-full max-w-5xl z-10 flex flex-col gap-4">
        {/* Barra superior de navegação */}
        <div className="flex items-center justify-between">
          <Link
            to={`/filme/${movie.id}`}
            className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-[#e8b44a] transition-colors"
          >
            <ArrowLeft size={18} /> Voltar para sinopse
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2.5 py-1 rounded-md bg-white/10 text-white/70 border border-white/10">
              {movie.streams.length} servidores
            </span>
          </div>
        </div>

        {/* Player Customizado com Proporção 16:9 Limpa e Sem Zoom */}
        <div className="w-full relative shadow-2xl rounded-2xl overflow-hidden bg-black border border-white/10">
          <OwnPlayer
            streams={movie.streams}
            poster={movie.tmdb?.backdropUrl || movie.posterUrl}
            title={movie.title}
            subtitle="Filmes"
            onBack={() => void navigate({ to: `/filme/${movie.id}` })}
            initialTime={savedProgress?.currentTime || 0}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>

        {/* Informações rápidas abaixo do player */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2">
          <div>
            <h1 className="text-2xl font-black text-white">{movie.title}</h1>
            <div className="flex items-center gap-3 text-sm text-white/50 mt-1">
              {movie.tmdb?.releaseYear && <span>{movie.tmdb.releaseYear}</span>}
              {movie.tmdb?.voteAverage ? (
                <span className="text-[#e8b44a] flex items-center gap-1 font-semibold">
                  <Star size={13} fill="currentColor" /> {movie.tmdb.voteAverage.toFixed(1)}
                </span>
              ) : null}
              <span>{movie.genres?.join(", ")}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/filme/${movie.id}`} className="ydo-btn-secondary text-sm">
              <Info size={16} /> Elenco & Ficha
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
