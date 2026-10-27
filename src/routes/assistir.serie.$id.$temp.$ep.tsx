import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tv, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import type { CatalogItem, StreamSource } from "@/lib/types";
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
        if (!res.ok) throw new Error("Erro");
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
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton" style={{ width: "80px", height: "80px", borderRadius: "50%" }} />
      </main>
    );
  }

  const targetSeason = Number(temp);
  const targetEpisode = Number(ep);
  const foundSeason = serie?.seasons?.find((s) => s.seasonNumber === targetSeason);
  const foundEp = foundSeason?.episodes?.find((e) => e.episodeNumber === targetEpisode);
  const streams: StreamSource[] = (foundEp?.streams && foundEp.streams.length > 0)
    ? foundEp.streams
    : (serie?.streams || []);

  if (!serie || streams.length === 0) {
    return (
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#fff", textAlign: "center", padding: "20px" }}>
        <Tv size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Episódio indisponível</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>
          Não encontramos fontes para a Temporada {temp}, Episódio {ep}.
        </p>
        <Link to={`/serie/${id}`} className="ydo-btn-secondary" style={{ marginTop: "8px" }}>
          <ArrowLeft size={16} /> Voltar para a Série
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
    <main style={{
      position: "fixed",
      inset: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "#000000",
      zIndex: 9999,
      overflow: "hidden",
      margin: 0,
      padding: 0,
    }}>
      {/* Player em Tela Completa Imersiva (Zero Zoom, Sem Bordas Brancas, Estilo Cinema) */}
      <OwnPlayer
        streams={streams}
        poster={serie.tmdb?.backdropUrl || serie.posterUrl}
        title={serie.title}
        subtitle={`Série • Temporada ${temp} - Episódio ${ep}`}
        onBack={() => void navigate({ to: `/serie/${serie.id}` })}
        initialTime={savedProgress?.currentTime || 0}
        onTimeUpdate={handleTimeUpdate}
      />
    </main>
  );
}
