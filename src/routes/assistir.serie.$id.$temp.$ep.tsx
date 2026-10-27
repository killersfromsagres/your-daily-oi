import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Tv } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import type { CatalogItem } from "@/lib/types";
import { loadCatalog } from "@/lib/catalog";
import { saveProgress, getProgressById } from "@/lib/storage";

export const Route = createFileRoute("/assistir/serie/$id/$temp/$ep")({
  component: WatchSeriesPage,
  head: () => ({ meta: [{ title: "Assistir Série — Your Daily Oi" }] }),
});

function WatchSeriesPage() {
  const { id, temp, ep } = Route.useParams();
  const [serie, setSerie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadCatalog()
      .then(({ items }) => {
        if (!active) return;
        const found = items.get(id) || Array.from(items.values()).find((i) => i.id === id);
        setSerie(found || null);
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

  // Se a série tem streams diretos ou nos episódios
  const streams = serie?.streams || [];

  if (!serie || streams.length === 0) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex flex-col items-center justify-center gap-4 text-center px-4">
        <Tv size={48} className="text-[#e8b44a]" />
        <h1 className="text-2xl font-bold text-white">Episódio não disponível</h1>
        <p className="text-white/60">
          Temporada {temp}, Episódio {ep} não possui stream ativo no momento.
        </p>
        <Link to={`/serie/${id}`} className="ydo-btn-secondary mt-2">
          <ArrowLeft size={16} /> Voltar à Série
        </Link>
      </main>
    );
  }

  const savedProgress = getProgressById(`${serie.id}-t${temp}-e${ep}`);

  const handleTimeUpdate = (currentTime: number) => {
    saveProgress({
      id: `${serie.id}-t${temp}-e${ep}`,
      type: "s",
      title: `${serie.title} (T${temp}:E${ep})`,
      posterUrl: serie.posterUrl,
      season: Number(temp),
      episode: Number(ep),
      currentTime,
      duration: 0,
      updatedAt: Date.now(),
    });
  };

  return (
    <main className="min-h-screen bg-black flex flex-col justify-center items-center px-4 md:px-12 py-16 relative">
      <div className="w-full max-w-6xl mb-4 flex items-center justify-between">
        <Link
          to={`/serie/${serie.id}`}
          className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} /> Voltar aos episódios
        </Link>
        <span className="text-xs text-white/40">
          T{temp} : E{ep} · {streams.length} fontes disponíveis
        </span>
      </div>

      <div className="w-full max-w-6xl shadow-2xl rounded-2xl overflow-hidden border border-white/10">
        <OwnPlayer
          streams={streams}
          poster={serie.tmdb?.backdropUrl || serie.posterUrl}
          title={`${serie.title} - T${temp}:E${ep}`}
          initialTime={savedProgress?.currentTime || 0}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>
    </main>
  );
}
