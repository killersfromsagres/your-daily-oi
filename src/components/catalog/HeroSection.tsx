"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Play, Info, Plus, Check, ChevronLeft, ChevronRight, Volume2, VolumeX, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cleanDisplayTitle } from "@/lib/catalog";
import { getSizedHeroImage } from "@/lib/hero-images";

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
  quality?: string;
}

interface HeroSectionProps {
  items: HeroItem[];
  edition?: "friday13";
  savedIds?: Set<string>;
  onToggleSaved?: (id: string) => void;
}

function Friday13Emblem() {
  const id = useId();
  return (
    <span className="zf-friday13-date" aria-hidden="true">
      <svg className="zf-friday13-emblem" viewBox="0 0 72 80" fill="none" focusable="false">
        <defs>
          <linearGradient id={`${id}-steel`} x1="36" y1="8" x2="53" y2="45" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f4eee1"/><stop offset=".32" stopColor="#8e9b9c"/>
            <stop offset=".55" stopColor="#dce1dc"/><stop offset="1" stopColor="#647579"/>
          </linearGradient>
          <linearGradient id={`${id}-blood`} x1="17" y1="27" x2="25" y2="68" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff7e69"/><stop offset=".28" stopColor="#db363e"/>
            <stop offset=".65" stopColor="#a51229"/><stop offset="1" stopColor="#580d1d"/>
          </linearGradient>
        </defs>
        {/* Broad steel blade, bevel and riveted grip: a machete silhouette. */}
        <g transform="rotate(24 44 39)">
          <path d="M37 8Q41 2 52 4V41Q51 48 37 51Z" fill={`url(#${id}-steel)`} stroke="#d5d4c5" strokeWidth=".65"/>
          <path d="M39 10V47Q47 45 50 41" stroke="#f7f3e7" strokeWidth="1" opacity=".7"/>
          <path d="M48 6V39" stroke="#465559" strokeWidth=".65" opacity=".55"/>
          <path d="M38 38L44 34L42 41L50 38L48 45L38 49Z" fill="#851c2b" opacity=".88"/>
          <path d="M35 50L51 46L52 50L36 54Z" fill="#a49c88" stroke="#453d39" strokeWidth=".8"/>
          <path d="M38 54L48 51V70Q47 75 42 75Q38 74 38 70Z" fill="#302122" stroke="#99715b" strokeWidth=".85"/>
          <path d="M40 56V70" stroke="#8e6151" strokeWidth=".8" opacity=".7"/>
          <circle cx="43" cy="58" r="1.25" fill="#b7a48a"/>
          <circle cx="43" cy="68" r="1.25" fill="#b7a48a"/>
        </g>
        <g className="zf-friday13-blood-number" fill={`url(#${id}-blood)`}>
          <text x="7" y="55" fontSize="40" fontWeight="900" letterSpacing="-4" stroke="#3a0a15" strokeWidth=".65" paintOrder="stroke">13</text>
          <path d="M15 53H18V64Q18 68 16.5 68Q15 68 15 64ZM35 53H38V59Q38 62 36.5 62Q35 62 35 59ZM42 51H44V64Q44 66 43 66Q42 66 42 64Z"/>
          <circle cx="16.5" cy="72" r="1.2"/>
        </g>
      </svg>
    </span>
  );
}

export function HeroSection({ items, savedIds = new Set(), onToggleSaved, edition }: HeroSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedBackdropId, setFailedBackdropId] = useState<string | null>(null);
  const [failedPosterId, setFailedPosterId] = useState<string | null>(null);
  const crossfadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const hero = items[activeIndex];
  const itemsKey = items.map(item => item.id).join("|");

  // When the server selects a new half-hour collection, show its first feature.
  useEffect(() => { setActiveIndex(0); }, [itemsKey]);

  // Avança apenas com aba visível; no celular preserva tempo de leitura e bateria.
  useEffect(() => {
    if (items.length <= 1) return;
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (prefersReducedMotion) return;
    const compact = window.matchMedia?.("(max-width: 1120px)").matches ?? false;
    crossfadeTimer.current = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setActiveIndex((i) => (i + 1) % items.length);
    }, compact ? 12000 : 8000);
    return () => {
      if (crossfadeTimer.current) clearInterval(crossfadeTimer.current);
    };
  }, [items.length]);

  useEffect(() => {
    if (activeIndex >= items.length && items.length > 0) setActiveIndex(0);
  }, [activeIndex, items.length]);

  // Preload only the *next* desktop image, once the current artwork has settled.
  // Never prefetch on mobile, data saver or slow connections.
  useEffect(() => {
    if (items.length <= 1 || document.visibilityState !== "visible") return;
    if (window.matchMedia?.("(max-width: 1120px)").matches) return;
    type NetworkInfo = { saveData?: boolean; effectiveType?: string };
    const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    if (connection?.saveData || ["slow-2g","2g","3g"].includes(connection?.effectiveType || "")) return;
    const next = items[(activeIndex + 1) % items.length];
    if (!next) return;
    const src = getSizedHeroImage(next.backdropUrl, next.posterUrl, "original");
    if (!src) return;
    const timeout = window.setTimeout(() => {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, [itemsKey, activeIndex]);

  const nextSlide = () => {
    setActiveIndex((i) => (i + 1) % items.length);
  };

  const prevSlide = () => {
    setActiveIndex((i) => (i - 1 + items.length) % items.length);
  };

  if (!hero) return null;

  const detailPath = hero.type === "f" ? `/filme/${hero.id}` : `/serie/${hero.id}`;
  const playPath = hero.type === "f" ? `/assistir/filme/${hero.id}` : `/assistir/serie/${hero.id}/1/1`;

  return (
    <section className={"ydo-hero"+(edition === "friday13" ? " zf-friday13-hero" : "")} aria-label={edition ? "Especial Sexta-feira 13" : "Carrossel em Destaque"}>
      {edition === "friday13" && <>
        <div className="zf-friday13-atmosphere" aria-hidden="true">
          <span className="zf-friday13-watermark">13</span>
          <div className="zf-friday13-fog" />
        </div>
        <div className="zf-friday13-masthead">
          <Friday13Emblem />
          <div><p>SEXTA-FEIRA 13</p><small>EDIÇÃO ESPECIAL · SÓ HOJE, ATÉ 23H59</small></div>
        </div>
      </>}
      {/* One image in memory; quality scales with display size. */}
      {(() => {
        const backdrop = failedBackdropId === hero.id ? null : hero.backdropUrl;
        const poster = failedPosterId === hero.id ? null : hero.posterUrl;
        const imageUrl = getSizedHeroImage(backdrop, poster, "w1280");
        const mobileUrl = getSizedHeroImage(backdrop, poster, "w1280");
        const largeUrl = getSizedHeroImage(backdrop, poster, "original");
        return (
          <div key={hero.id} className="ydo-hero-slide is-active" aria-hidden={false}>
            {imageUrl && (
              <picture>
                {/* Original TMDB artwork on desktop / high-density tablet;
                    1280px on phones preserves sharpness without oversized memory use.
                    Original quality depends on the source file's actual resolution. */}
                <source media="(min-width: 1024px)" srcSet={largeUrl} />
                <source media="(min-width: 700px) and (min-resolution: 2dppx)" srcSet={largeUrl} />
                <source media="(max-width: 1023px)" srcSet={mobileUrl} />
                <img src={imageUrl} alt="" className="ydo-hero-img"
                  fetchPriority="high" loading="eager" decoding="async"
                  onError={() => {
                    if (failedBackdropId !== hero.id && hero.backdropUrl) setFailedBackdropId(hero.id);
                    else setFailedPosterId(hero.id);
                  }}
                />
              </picture>
            )}
          </div>
        );
      })()}

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
          <span className="ydo-hero-badge-tag">{edition ? "A NOITE É DE JASON" : "EM ALTA"}</span>
          {hero.hasDub && <span className="ydo-hero-badge">DUBLADO</span>}
          {hero.hasLeg && <span className="ydo-hero-badge ydo-hero-badge-leg">LEGENDADO</span>}
          {hero.type === "s" && <span className="ydo-hero-badge ydo-hero-badge-type">SÉRIE</span>}
        </div>

        <h1 className="ydo-hero-title">{cleanDisplayTitle(hero.title)}</h1>

        <div className="ydo-hero-meta">
          {hero.releaseYear && <span className="ydo-hero-year">{hero.releaseYear}</span>}
          {hero.voteAverage ? (
            <span className="ydo-hero-score"><Star size={15} className="zf-rating-icon" fill="currentColor" aria-hidden="true" /> {hero.voteAverage.toFixed(1)}</span>
          ) : null}
          <span className="ydo-hero-quality">{hero.quality || "FULL HD"}</span>
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
