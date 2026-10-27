import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Film, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import { PlayerErrorBoundary } from "@/components/player/PlayerErrorBoundary";
import type { CatalogItem, StreamSource } from "@/lib/types";
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

  const [extraStreams, setExtraStreams] = useState<StreamSource[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.allSettled([
      fetch(`/api/item?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/resolve-vod?id=${encodeURIComponent(id)}&tipo=movie`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([itemRes, resolveRes]) => {
        if (!active) return;
        if (itemRes.status === "fulfilled" && itemRes.value && !itemRes.value.error) {
          setMovie(itemRes.value as CatalogItem);
        }
        if (resolveRes.status === "fulfilled" && resolveRes.value?.sources) {
          setExtraStreams(resolveRes.value.sources as StreamSource[]);
        }
      })
      .catch(() => {})
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

  // Combina as fontes do resolve-vod (com relay) e as fontes nativas
  const streams: StreamSource[] = [
    ...extraStreams,
    ...(movie?.streams || []),
  ];

  if (!movie || streams.length === 0) {
    return (
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#fff", textAlign: "center", padding: "20px" }}>
        <Film size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Stream indisponível</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>Não encontramos fontes ativas para este filme no catálogo.</p>
        <Link to="/" className="ydo-btn-secondary" style={{ marginTop: "8px" }}>
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
      <PlayerErrorBoundary
        title={movie.title}
        onBack={() => void navigate({ to: `/filme/${movie.id}` })}
      >
        <OwnPlayer
          streams={streams}
          poster={movie.tmdb?.backdropUrl || movie.posterUrl}
          title={movie.title}
          subtitle="Filmes"
          onBack={() => void navigate({ to: `/filme/${movie.id}` })}
          initialTime={savedProgress?.currentTime || 0}
          onTimeUpdate={handleTimeUpdate}
        />
      </PlayerErrorBoundary>
    </main>
  );
}
