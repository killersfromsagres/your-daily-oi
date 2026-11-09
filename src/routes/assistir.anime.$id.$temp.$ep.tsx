import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tv, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { OwnPlayer } from "@/components/player";
import { PlayerErrorBoundary } from "@/components/player/PlayerErrorBoundary";
import type { CatalogItem, StreamSource } from "@/lib/types";
import { saveProgress, getProgressById } from "@/lib/storage";
import { getEpisodeProgress, saveEpisodeProgress, setEpisodeWatched } from "@/lib/episode-progress";

export const Route = createFileRoute("/assistir/anime/$id/$temp/$ep")({
  component: WatchAnimePage,
  head: () => ({
    meta: [{ title: "Assistir Anime — Zang Flix" }],
    links: [
      { rel: "preconnect", href: "https://saimo-tv.pages.dev" },
      { rel: "dns-prefetch", href: "https://saimo-tv.pages.dev" },
    ],
  }),
});

function WatchAnimePage() {
  const { id, temp, ep } = Route.useParams();
  const navigate = useNavigate();
  const [anime, setAnime] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [extraStreams, setExtraStreams] = useState<StreamSource[]>([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    // Bound external provider waits. The first playable response renders the
    // player immediately; late alternatives are merged without restarting it.
    const timer = window.setTimeout(() => controller.abort(), 14_000);
    let pending = 2;
    setAnime(null);
    setExtraStreams([]);
    setLoading(true);

    const finished = () => {
      pending -= 1;
      if (pending === 0) {
        window.clearTimeout(timer);
        if (active) setLoading(false);
      }
    };

    fetch(`/api/item?id=${encodeURIComponent(id)}&tipo=anime`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`Ficha indisponível (HTTP ${response.status})`);
      return response.json() as Promise<CatalogItem>;
    }).then(item => {
      if (!active || !item?.id) return;
      setAnime(item);
      const exact = item.seasons?.find(s => s.seasonNumber === Number(temp))
        ?.episodes.find(e => e.episodeNumber === Number(ep));
      if (exact?.streams?.length) setLoading(false);
    }).catch(error => {
      if (active && !controller.signal.aborted) console.warn("[WatchAnime] Ficha:", error);
    }).finally(finished);

    fetch(`/api/resolve-vod?id=${encodeURIComponent(id)}&tipo=anime&temp=${encodeURIComponent(temp)}&ep=${encodeURIComponent(ep)}`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`Fontes indisponíveis (HTTP ${response.status})`);
      return response.json() as Promise<{ sources?: StreamSource[] }>;
    }).then(data => {
      if (!active || !Array.isArray(data.sources)) return;
      setExtraStreams(data.sources);
      if (data.sources.length) setLoading(false);
    }).catch(error => {
      if (active && !controller.signal.aborted) console.warn("[WatchAnime] Fontes:", error);
    }).finally(finished);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
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

  if (streams.length === 0) {
    return (
      <main style={{ width: "100vw", height: "100vh", backgroundColor: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#fff", textAlign: "center", padding: "20px" }}>
        <Tv size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Episódio indisponível</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>
          Não encontramos fontes ativas para o Temporada {temp}, Episódio {ep}.
        </p>
        <Link to="/anime/$id" params={{id}} className="ydo-btn-secondary" style={{ marginTop: "8px" }}>
          <ArrowLeft size={16} /> Voltar ao Anime
        </Link>
      </main>
    );
  }

  const effectiveAnime: CatalogItem = anime || {
    id,
    type: "a",
    title: id,
    tmdbId: !isNaN(Number(id)) ? Number(id) : null,
    posterPath: "",
    posterUrl: "",
    genres: [],
    tmdb: null,
    streams: [],
  };

  const episodeKey = { type: "a" as const, contentId: effectiveAnime.id, season: Number(temp), episode: Number(ep) };
  const savedProgress = getProgressById(`${effectiveAnime.id}-t${temp}-e${ep}`);
  const episodeSaved = getEpisodeProgress(episodeKey);

  const handleTimeUpdate = (currentTime: number, duration?: number) => {
    if (currentTime < 2) return;
    saveEpisodeProgress(episodeKey, currentTime, duration || 0);
    saveProgress({
      id: `${effectiveAnime.id}-t${temp}-e${ep}`,
      contentId: effectiveAnime.id,
      type: "a",
      title: `${effectiveAnime.title} (T${temp}:E${ep})`,
      ...(effectiveAnime.posterUrl ? {posterUrl:effectiveAnime.posterUrl} : {}),
      season: Number(temp),
      episode: Number(ep),
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
      <PlayerErrorBoundary
        title={effectiveAnime.title || "Anime"}
        onBack={() => void navigate({ to: `/anime/${effectiveAnime.id}` })}
      >
        <OwnPlayer
          streams={streams}
          {...(effectiveAnime.tmdb?.backdropUrl || effectiveAnime.posterUrl ? {poster: effectiveAnime.tmdb?.backdropUrl || effectiveAnime.posterUrl} : {})}
          title={effectiveAnime.title || "Anime"}
          subtitle={`Temporada ${temp} - Episódio ${ep}`}
          onBack={() => void navigate({ to: `/anime/${effectiveAnime.id}` })}
          initialTime={episodeSaved?.completed ? 0 : episodeSaved?.currentTime || savedProgress?.currentTime || 0}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => { setEpisodeWatched(episodeKey, true); }}
          {...(effectiveAnime.tmdb?.runtime && effectiveAnime.tmdb.runtime > 0 ? { expectedRuntimeMin: effectiveAnime.tmdb.runtime } : {})}
        />
      </PlayerErrorBoundary>
    </main>
  );
}
