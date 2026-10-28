import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tv, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import { PlayerErrorBoundary } from "@/components/player/PlayerErrorBoundary";
import type { CatalogItem, StreamSource } from "@/lib/types";
import { saveProgress, getProgressById } from "@/lib/storage";

export const Route = createFileRoute("/assistir/anime/$id/$temp/$ep")({
  component: WatchAnimePage,
  head: () => ({ meta: [{ title: "Assistir Anime — Zang Flix" }] }),
});

function WatchAnimePage() {
  const { id, temp, ep } = Route.useParams();
  const navigate = useNavigate();
  const [anime, setAnime] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [extraStreams, setExtraStreams] = useState<StreamSource[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.allSettled([
      fetch(`/api/item?id=${encodeURIComponent(id)}&tipo=anime`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/resolve-vod?id=${encodeURIComponent(id)}&tipo=anime&temp=${temp}&ep=${ep}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/anime-sushi/episodio?id=${encodeURIComponent(id)}&temp=${temp}&ep=${ep}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([itemRes, resolveRes, sushiRes]) => {
        if (!active) return;
        if (itemRes.status === "fulfilled" && itemRes.value && !itemRes.value.error) {
          setAnime(itemRes.value as CatalogItem);
        }
        const collectedSources: StreamSource[] = [];
        if (resolveRes.status === "fulfilled" && resolveRes.value?.sources) {
          collectedSources.push(...(resolveRes.value.sources as StreamSource[]));
        }
        if (sushiRes.status === "fulfilled" && sushiRes.value?.sources) {
          collectedSources.push(...(sushiRes.value.sources as StreamSource[]));
        }
        setExtraStreams(collectedSources);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, temp, ep]);

  if (loading) {
    return (
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton" style={{ width: "80px", height: "80px", borderRadius: "50%" }} />
      </main>
    );
  }

  const targetSeason = Number(temp);
  const targetEpisode = Number(ep);
  const foundSeason = anime?.seasons?.find((s) => s.seasonNumber === targetSeason);
  const foundEp = foundSeason?.episodes?.find((e) => e.episodeNumber === targetEpisode);
  // A fonte exata do episódio (arquivo direto do catálogo) vem SEMPRE antes do relay
  // do Saimo: o relay de séries já foi observado servindo o episódio 1 da temporada 1
  // no navegador, então o arquivo correto do episódio precisa ser tentado primeiro.
  const seenUrls = new Set<string>();
  const streams: StreamSource[] = [
    ...(foundEp?.streams || []),
    ...extraStreams,
  ].filter((s) => {
    if (!s?.url || seenUrls.has(s.url)) return false;
    seenUrls.add(s.url);
    return true;
  });

  if (!anime || streams.length === 0) {
    return (
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#fff", textAlign: "center", padding: "20px" }}>
        <Tv size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Episódio indisponível</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>
          Não encontramos fontes ativas para o Temporada {temp}, Episódio {ep}.
        </p>
        <Link to={`/anime/${id}`} className="ydo-btn-secondary" style={{ marginTop: "8px" }}>
          <ArrowLeft size={16} /> Voltar ao Anime
        </Link>
      </main>
    );
  }

  const savedProgress = getProgressById(`${anime?.id || id}-t${temp}-e${ep}`);

  const handleTimeUpdate = (currentTime: number) => {
    if (!anime) return;
    saveProgress({
      id: `${anime.id}-t${temp}-e${ep}`,
      type: "a",
      title: `${anime.title} (T${temp}:E${ep})`,
      posterUrl: anime.posterUrl,
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
      height: "100dvh",
      backgroundColor: "#000000",
      zIndex: 9999,
      overflow: "hidden",
      margin: 0,
      padding: 0,
    }}>
      <PlayerErrorBoundary
        title={anime?.title || "Anime"}
        onBack={() => void navigate({ to: `/anime/${id}` })}
      >
        <OwnPlayer
          streams={streams}
          poster={anime?.tmdb?.backdropUrl || anime?.posterUrl}
          title={anime?.title || "Anime"}
          subtitle={`Temporada ${temp} - Episódio ${ep}`}
          preferredAudio="leg"
          onBack={() => void navigate({ to: `/anime/${id}` })}
          initialTime={savedProgress?.currentTime || 0}
          onTimeUpdate={handleTimeUpdate}
        />
      </PlayerErrorBoundary>
    </main>
  );
}
