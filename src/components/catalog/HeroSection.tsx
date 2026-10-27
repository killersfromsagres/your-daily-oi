"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Info, Plus, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";

export interface HeroItem {
  id: string;
  type: "f" | "s";
  title: string;
  overview?: string;
  backdropUrl?: string | null;
  posterUrl?: string;
  genres?: string[];
  releaseYear?: number | null;
  voteAverage?: number;
  hasDub?: boolean;
  hasLeg?: boolean;
}

interface HeroSectionProps {
  items: HeroItem[];
  savedIds?: Set<string>;
  onToggleSaved?: (id: string) => void;
}

export function HeroSection({ items, savedIds = new Set(), onToggleSaved }: HeroSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [idle, setIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossfadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hero = items[activeIndex];

  // Crossfade a cada 8s
  useEffect(() => {
    if (items.length <= 1) return;
    crossfadeTimer.current = setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length);
    }, 8000);
    return () => {
      if (crossfadeTimer.current) clearInterval(crossfadeTimer.current);
    };
  }, [items.length]);

  // Idle state: sem interação por 5s -> backdrop desfoca
  useEffect(() => {
    const resetIdle = () => {
      setIdle(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIdle(true), 5000);
    };
    document.addEventListener("mousemove", resetIdle);
    document.addEventListener("keydown", resetIdle);
    document.addEventListener("touchstart", resetIdle);
    resetIdle();
    return () => {
      document.removeEventListener("mousemove", resetIdle);
      document.removeEventListener("keydown", resetIdle);
      document.removeEventListener("touchstart", resetIdle);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!hero) return null;

  const detailPath = hero.type === "f" ? `/filme/${hero.id}` : `/serie/${hero.id}`;
  const playPath = hero.type === "f" ? `/assistir/filme/${hero.id}` : `/assistir/serie/${hero.id}/1/1`;

  return (
    <section className="ydo-hero" aria-label="Destaque">
      {/* Backdrops com transição cruzada */}
      {items.map((item, i) => (
        <div
          key={item.id}
          className="ydo-hero-backdrop"
          aria-hidden="true"
          style={{
            backgroundImage: item.backdropUrl
              ? `url("${item.backdropUrl}")`
              : item.posterUrl
              ? `url("${item.posterUrl}")`
              : "none",
            opacity: i === activeIndex ? (idle ? 0.35 : 0.85) : 0,
            filter: idle ? "blur(8px)" : "none",
            transform: idle ? "scale(1.04)" : "scale(1)",
          }}
        />
      ))}

      {/* Duplo véu de legibilidade */}
      <div className="ydo-hero-veil-h" aria-hidden="true" />
      <div className="ydo-hero-veil-v" aria-hidden="true" />

      {/* Conteúdo em destaque */}
      <div className="ydo-hero-content">
        <div className="ydo-hero-badges">
          {hero.hasDub && <span className="ydo-hero-badge">DUBLADO</span>}
          {hero.hasLeg && <span className="ydo-hero-badge ydo-hero-badge-leg">LEGENDADO</span>}
          {hero.type === "s" && <span className="ydo-hero-badge ydo-hero-badge-type">SÉRIE</span>}
        </div>

        <h1 className="ydo-hero-title">{hero.title}</h1>

        <div className="ydo-hero-meta">
          {hero.releaseYear && <span>{hero.releaseYear}</span>}
          {hero.voteAverage ? (
            <span className="ydo-hero-score">★ {hero.voteAverage.toFixed(1)}</span>
          ) : null}
          {hero.genres?.slice(0, 2).map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>

        {hero.overview && (
          <p className="ydo-hero-overview line-clamp-2">{hero.overview}</p>
        )}

        <div className="ydo-hero-actions">
          <Link to={playPath} className="ydo-btn-primary">
            <Play size={20} fill="currentColor" aria-hidden />
            Assistir
          </Link>
          <Link to={detailPath} className="ydo-btn-secondary">
            <Info size={20} aria-hidden />
            Mais informações
          </Link>
          <button
            className="ydo-btn-icon"
            onClick={() => onToggleSaved?.(hero.id)}
            aria-label={
              savedIds.has(hero.id)
                ? `Remover ${hero.title} da lista`
                : `Adicionar ${hero.title} à lista`
            }
          >
            {savedIds.has(hero.id) ? <Check size={20} /> : <Plus size={20} />}
          </button>
        </div>
      </div>

      {/* Indicadores do carrossel */}
      {items.length > 1 && (
        <div className="ydo-hero-dots" aria-label="Destaques">
          {items.map((_, i) => (
            <button
              key={i}
              className={`ydo-hero-dot${i === activeIndex ? " active" : ""}`}
              onClick={() => setActiveIndex(i)}
              aria-label={`Destaque ${i + 1}`}
              aria-current={i === activeIndex}
            />
          ))}
        </div>
      )}
    </section>
  );
}
