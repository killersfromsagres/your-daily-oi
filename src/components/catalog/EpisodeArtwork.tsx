"use client";
// src/components/catalog/EpisodeArtwork.tsx — React 19, image fallback for TV/anime episode cards.
import { useEffect, useState } from "react";
import { Clapperboard, Play } from "lucide-react";

interface EpisodeArtworkProps {
  still?: string | null;
  fallback?: string | null;
  episodeNumber: number;
  title: string;
}
export function EpisodeArtwork({ still, fallback, episodeNumber, title }: EpisodeArtworkProps) {
  const [image, setImage] = useState<string | null>(still || fallback || null);
  useEffect(() => setImage(still || fallback || null), [still, fallback]);
  const illustrative = Boolean(image && image !== still);
  const onError = () => setImage(current =>
    current === still && fallback && fallback !== still ? fallback : null
  );
  return (
    <div className="zf-episode-art" aria-label={title}>
      {image
        ? <img src={image} alt={illustrative ? "Capa ilustrativa de " + title : "Cena de " + title}
            loading="lazy" decoding="async" onError={onError} />
        : <div className="zf-episode-art-empty"><Clapperboard size={30} /><span>Imagem indisponível</span></div>}
      <span className="zf-episode-art-number">EP {String(episodeNumber).padStart(2, "0")}</span>
      {illustrative && <span className="zf-episode-art-illustrative">Imagem ilustrativa</span>}
      <span className="zf-episode-art-play"><Play size={20} fill="currentColor" /></span>
    </div>
  );
}
