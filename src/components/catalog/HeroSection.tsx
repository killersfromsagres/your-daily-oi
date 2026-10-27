"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Info, Plus, Check, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cleanDisplayTitle } from "@/lib/catalog";

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
  const crossfadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hero = items[activeIndex];

  // Alterna o slide do carrossel a cada 7 segundos
  useEffect(() => {
    if (items.length <= 1) return;
    crossfadeTimer.current = setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length);
    }, 7000);
    return () => {
      if (crossfadeTimer.current) clearInterval(crossfadeTimer.current);
    };
  }, [items.length]);

  const nextSlide = () => {
    setActiveIndex((i) => (i + 1) % items.length);
  };

  const prevSlide = () => {
    setActiveIndex((i) => (i - 1 + items.length) % items.length);
  };

  if (!hero) return null;

  const detailPath = hero.type === "f" ? `/filme/${hero.id}` : `/serie/${hero.id}`;
  const playPath = hero.type === "f" ? `/assistir/filme/${hero.id}` : `/assistir/serie/${hero.id}/1/1`;

  // Imagem do backdrop em altíssima resolução original oficial (HD / 4K)
  const bgImage = (item: HeroItem) => {
    if (item.backdropUrl) {
      return item.backdropUrl.replace(/\/w\d+/, "/original");
    }
    if (item.posterUrl) {
      return item.posterUrl.replace("/w342", "/original");
    }
    return "";
  };

  return (
    <section className="ydo-hero" aria-label="Carrossel em Destaque">
      {/* Slides com transição cruzada e fade suave */}
      {items.map((item, i) => {
        const imageUrl = bgImage(item);
        const isActive = i === activeIndex;

        return (
          <div
            key={item.id}
            className={`ydo-hero-slide ${isActive ? "is-active" : ""}`}
            aria-hidden={!isActive}
          >
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className="ydo-hero-img"
                loading={i === 0 ? "eager" : "lazy"}
              />
            )}
          </div>
        );
      })}

      {/* Véus cinematográficos para legibilidade impecável */}
      <div className="ydo-hero-veil-left" aria-hidden="true" />
      <div className="ydo-hero-veil-bottom" aria-hidden="true" />
      <div className="ydo-hero-veil-top" aria-hidden="true" />

      {/* Setas de navegação lateral no carrossel */}
      {items.length > 1 && (
        <>
          <button
            className="ydo-hero-nav-arrow ydo-hero-arrow-prev"
            onClick={prevSlide}
            aria-label="Destaque anterior"
          >
            <ChevronLeft size={28} />
          </button>
          <button
            className="ydo-hero-nav-arrow ydo-hero-arrow-next"
            onClick={nextSlide}
            aria-label="Próximo destaque"
          >
            <ChevronRight size={28} />
          </button>
        </>
      )}

      {/* Conteúdo sobreposto */}
      <div className="ydo-hero-content">
        <div className="ydo-hero-badges">
          <span className="ydo-hero-badge-tag">EM ALTA</span>
          {hero.hasDub && <span className="ydo-hero-badge">DUBLADO</span>}
          {hero.hasLeg && <span className="ydo-hero-badge ydo-hero-badge-leg">LEGENDADO</span>}
          {hero.type === "s" && <span className="ydo-hero-badge ydo-hero-badge-type">SÉRIE</span>}
        </div>

        <h1 className="ydo-hero-title">{cleanDisplayTitle(hero.title)}</h1>

        <div className="ydo-hero-meta">
          {hero.releaseYear && <span className="ydo-hero-year">{hero.releaseYear}</span>}
          {hero.voteAverage ? (
            <span className="ydo-hero-score">★ {hero.voteAverage.toFixed(1)}</span>
          ) : null}
          <span className="ydo-hero-quality">ULTRA HD</span>
          {hero.genres?.slice(0, 3).map((g) => (
            <span key={g} className="ydo-hero-genre">
              {g}
            </span>
          ))}
        </div>

        {hero.overview ? (
          <p className="ydo-hero-overview line-clamp-3">{hero.overview}</p>
        ) : (
          <p className="ydo-hero-overview">
            Descubra este e outros grandes sucessos disponíveis no catálogo oficial Zang Flix.
          </p>
        )}

        <div className="ydo-hero-actions">
          <Link to={playPath} className="ydo-btn-primary">
            <Play size={20} fill="currentColor" aria-hidden />
            Assistir Agora
          </Link>
          <Link to={detailPath} className="ydo-btn-secondary">
            <Info size={20} aria-hidden />
            Mais Detalhes
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

      {/* Indicadores de slides do carrossel */}
      {items.length > 1 && (
        <div className="ydo-hero-dots" aria-label="Seletor de destaques">
          {items.map((it, idx) => (
            <button
              key={it.id}
              className={`ydo-hero-dot ${idx === activeIndex ? "active" : ""}`}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Ir para ${it.title}`}
              aria-current={idx === activeIndex}
            />
          ))}
        </div>
      )}
    </section>
  );
}
