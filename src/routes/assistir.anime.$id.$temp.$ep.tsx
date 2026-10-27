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

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/item?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<CatalogItem>;
      })
      .then((found) => {
        if (!active) return;
        setAnime(found);
      })
      .catch(() => {
        fetch("/api/catalogo", { cache: "no-store" })
          .then((r) => r.json() as Promise<{ items: CatalogItem[] }>)
          .then((d) => {
            if (!active) return;
            const f = d.items.find((i) => i.id === id);
            setAnime(f || null);
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
  const foundSeason = anime?.seasons?.find((s) => s.seasonNumber === targetSeason);
  const foundEp = foundSeason?.episodes?.find((e) => e.episodeNumber === targetEpisode);
  const streams: StreamSource[] = (foundEp?.streams && foundEp.streams.length > 0)
    ? foundEp.streams
    : (anime?.streams || [
        { url: "https://exemplo.invalid/episodio.mp4", audio: "leg" as const, format: "mp4" as const },
        { url: "https://exemplo.invalid/episodio-dub.mp4", audio: "dub" as const, format: "mp4" as const }
      ]);

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
