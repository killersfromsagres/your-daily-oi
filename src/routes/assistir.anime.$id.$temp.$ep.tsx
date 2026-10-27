import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tv, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
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
      fetch(`/api/item?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/resolve-vod?id=${encodeURIComponent(id)}&tipo=series&temp=${temp}&ep=${ep}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([itemRes, resolveRes]) => {
        if (!active) return;
        if (itemRes.status === "fulfilled" && itemRes.value && !itemRes.value.error) {
          setAnime(itemRes.value as CatalogItem);
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
  const streams: StreamSource[] = [
    ...extraStreams,
    ...(foundEp?.streams || []),
    ...(anime?.streams || []),
  ];

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
      height: "100vh",
      backgroundColor: "#000000",
      zIndex: 9999,
      overflow: "hidden",
      margin: 0,
      padding: 0,
    }}>
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
    </main>
  );
}
