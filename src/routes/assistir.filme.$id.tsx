import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Film } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import type { CatalogItem } from "@/lib/types";
import { loadCatalog } from "@/lib/catalog";
import { saveProgress, getProgressById } from "@/lib/storage";

export const Route = createFileRoute("/assistir/filme/$id")({
  component: WatchMoviePage,
  head: () => ({ meta: [{ title: "Assistir Filme — Your Daily Oi" }] }),
});

function WatchMoviePage() {
  const { id } = Route.useParams();
  const [movie, setMovie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadCatalog()
      .then(({ items }) => {
        if (!active) return;
        const found = items.get(id) || Array.from(items.values()).find((i) => i.id === id);
        setMovie(found || null);
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
      <main className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="skeleton w-full max-w-4xl aspect-video rounded-xl" />
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
    <main className="min-h-screen bg-black flex flex-col justify-center items-center px-4 md:px-12 py-16 relative">
      <div className="w-full max-w-6xl mb-4 flex items-center justify-between">
        <Link
          to={`/filme/${movie.id}`}
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} /> Voltar aos detalhes
        </Link>
        <span className="text-xs text-white/40">{movie.streams.length} fontes disponíveis</span>
      </div>

      <div className="w-full max-w-6xl shadow-2xl rounded-2xl overflow-hidden border border-white/10">
        <OwnPlayer
          streams={movie.streams}
          poster={movie.tmdb?.backdropUrl || movie.posterUrl}
          title={movie.title}
          initialTime={savedProgress?.currentTime || 0}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>
    </main>
  );
}
