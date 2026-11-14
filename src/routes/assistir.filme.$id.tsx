import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Film, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import { PlayerErrorBoundary } from "@/components/player/PlayerErrorBoundary";
import type { CatalogItem, StreamSource } from "@/lib/types";
import { shortlistVodSources } from "@/lib/vod-source-quality";
import { catalogDisplayTitle } from "@/lib/catalog";
import { saveProgress, getProgressById } from "@/lib/storage";

export const Route = createFileRoute("/assistir/filme/$id")({
  component: WatchMoviePage,
  head: () => ({
    meta: [{ title: "Assistir Filme — Zang Flix" }],

  }),
});

function WatchMoviePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [extraStreams, setExtraStreams] = useState<StreamSource[]>([]);

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    let requestsRemaining = 2;
    setMovie(null);
    setExtraStreams([]);
    setLoading(true);

    const requestDone = () => {
      requestsRemaining--;
      if (active && requestsRemaining === 0) setLoading(false);
    };

    // Prioriza o primeiro resultado útil: não espera o agregador de fontes externas
    // para iniciar o MP4 do Saimo por proxy.
    fetch(`/api/item?id=${encodeURIComponent(id)}&tipo=movie`, {
      cache: "no-store", signal: abort.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Item HTTP ${res.status}`);
        return res.json() as Promise<CatalogItem>;
      })
      .then((item) => {
        if (!active || !item?.id) return;
        setMovie(item);
        if (shortlistVodSources(item.streams||[]).length) setLoading(false);
      })
      .catch((err: unknown) => {
        if (active) console.warn("[WatchMovie] Falha ao obter ficha:", err);
      })
      .finally(requestDone);

    fetch(`/api/resolve-vod?id=${encodeURIComponent(id)}&tipo=movie`, {
      cache: "no-store", signal: abort.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Resolve HTTP ${res.status}`);
        return res.json() as Promise<{ sources?: StreamSource[] }>;
      })
      .then((result) => {
        if (!active || !Array.isArray(result.sources)) return;
        setExtraStreams(result.sources);
        if (shortlistVodSources(result.sources).length) setLoading(false);
      })
      .catch((err: unknown) => {
        if (active) console.warn("[WatchMovie] Falha nas fontes complementares:", err);
      })
      .finally(requestDone);

    return () => {
      active = false;
      abort.abort();
    };
  }, [id]);

  // Resolved catalogue sources (especially verified episode/movie links)
  // are tried first. Do not create four unconditional pseudo-servers that
  // fail before the working "Catálogo" source can start.
  const streams = useMemo<StreamSource[]>(() => {
    const candidates = [...(movie?.streams || []), ...extraStreams];
    return shortlistVodSources(candidates, 6);
  }, [movie?.streams, movie?.tmdbId, extraStreams]);

  if (loading) {
    return (
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton" style={{ width: "80px", height: "80px", borderRadius: "50%" }} />
      </main>
    );
  }


  if (streams.length === 0) {
    return (
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#fff", textAlign: "center", padding: "20px" }}>
        <Film size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Filme dublado indisponível</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>Não encontramos uma fonte dublada disponível para este filme.</p>
        <Link to="/" className="ydo-btn-secondary" style={{ marginTop: "8px" }}>
          <ArrowLeft size={16} /> Voltar ao Início
        </Link>
      </main>
    );
  }

  const effectiveMovie: CatalogItem = movie || {
    id,
    type: "f",
    title: id,
    tmdbId: !isNaN(Number(id)) ? Number(id) : null,
    posterPath: "",
    posterUrl: "",
    genres: [],
    tmdb: null,
    streams,
  };

  const savedProgress = getProgressById(effectiveMovie.id);

  const handleTimeUpdate = (currentTime: number, duration?: number) => {
    if (currentTime < 2) return;
    saveProgress({
      id: effectiveMovie.id,
      contentId: effectiveMovie.id,
      type: "f",
      title: catalogDisplayTitle(effectiveMovie),
      ...(effectiveMovie.posterUrl ? {posterUrl:effectiveMovie.posterUrl} : {}),
      currentTime,
      duration: duration || 0,
      updatedAt: Date.now(),
    });
  };

  return (
    <main style={{
      position: "fixed",
      inset: 0,
      width: "100vw",
      height: "100dvh",
      backgroundColor: "#000000",
      zIndex: 9999,
      overflow: "hidden",
      margin: 0,
      padding: 0,
    }}>
      {/* Player em Tela Completa Imersiva (Zero Zoom, Sem Bordas Brancas, Estilo Cinema) */}
      <PlayerErrorBoundary
        title={catalogDisplayTitle(effectiveMovie)}
        onBack={() => void navigate({ to: `/filme/${effectiveMovie.id}` })}
      >
        <OwnPlayer
          contentType="movie"
          streams={streams}
          poster={effectiveMovie.tmdb?.backdropUrl || effectiveMovie.posterUrl}
          title={catalogDisplayTitle(effectiveMovie)}
          subtitle="Filmes"
          onBack={() => void navigate({ to: `/filme/${effectiveMovie.id}` })}
          initialTime={savedProgress?.currentTime || 0}
          onTimeUpdate={handleTimeUpdate}
          {...(effectiveMovie.tmdb?.runtime && effectiveMovie.tmdb.runtime > 0
            ? { expectedRuntimeMin: effectiveMovie.tmdb.runtime } : {})}
        />
      </PlayerErrorBoundary>
    </main>
  );
}
