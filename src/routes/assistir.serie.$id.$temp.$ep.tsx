import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Tv, Info, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import type { CatalogItem } from "@/lib/types";
import { saveProgress, getProgressById } from "@/lib/storage";

export const Route = createFileRoute("/assistir/serie/$id/$temp/$ep")({
  component: WatchSeriesPage,
  head: () => ({ meta: [{ title: "Assistir Série — Zang Flix" }] }),
});

function WatchSeriesPage() {
  const { id, temp, ep } = Route.useParams();
  const navigate = useNavigate();
  const [serie, setSerie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/item?id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao buscar série");
        return res.json() as Promise<CatalogItem>;
      })
      .then((found) => {
        if (!active) return;
        setSerie(found);
      })
      .catch(() => {
        fetch("/api/catalogo")
          .then((r) => r.json() as Promise<{ items: CatalogItem[] }>)
          .then((d) => {
            if (!active) return;
            const f = d.items.find((i) => i.id === id);
            setSerie(f || null);
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
        <span className="mt-4 text-white/50 text-sm">Carregando player...</span>
      </main>
    );
  }

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
    <main className="min-h-screen bg-[#0a0b14] text-white flex flex-col justify-center items-center px-4 md:px-10 py-24 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15 filter blur-3xl pointer-events-none scale-110"
        style={{
          backgroundImage: serie.tmdb?.backdropUrl
            ? `url(${serie.tmdb.backdropUrl})`
            : serie.posterUrl
            ? `url(${serie.posterUrl})`
            : "none",
        }}
      />

      <div className="w-full max-w-5xl z-10 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link
            to={`/serie/${serie.id}`}
            className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-[#e8b44a] transition-colors"
          >
            <ArrowLeft size={18} /> Voltar aos episódios
          </Link>
          <span className="text-xs px-2.5 py-1 rounded-md bg-white/10 text-white/70 border border-white/10">
            T{temp} : E{ep} · {streams.length} servidores
          </span>
        </div>

        <div className="w-full relative shadow-2xl rounded-2xl overflow-hidden bg-black border border-white/10">
          <OwnPlayer
            streams={streams}
            poster={serie.tmdb?.backdropUrl || serie.posterUrl}
            title={serie.title}
            subtitle={`Série • Temporada ${temp} - Episódio ${ep}`}
            onBack={() => void navigate({ to: `/serie/${serie.id}` })}
            initialTime={savedProgress?.currentTime || 0}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2">
          <div>
            <h1 className="text-2xl font-black text-white">
              {serie.title} <span className="text-[#e8b44a] font-bold">T{temp}:E{ep}</span>
            </h1>
            <div className="flex items-center gap-3 text-sm text-white/50 mt-1">
              {serie.tmdb?.releaseYear && <span>{serie.tmdb.releaseYear}</span>}
              {serie.tmdb?.voteAverage ? (
                <span className="text-[#e8b44a] flex items-center gap-1 font-semibold">
                  <Star size={13} fill="currentColor" /> {serie.tmdb.voteAverage.toFixed(1)}
                </span>
              ) : null}
              <span>{serie.genres?.join(", ")}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/serie/${serie.id}`} className="ydo-btn-secondary text-sm">
              <Info size={16} /> Temporadas & Elenco
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
