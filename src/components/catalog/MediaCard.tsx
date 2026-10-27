"use client";
import { useState } from "react";
import { Play, Plus, Check, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
import { cleanDisplayTitle } from "@/lib/catalog";

interface MediaCardProps {
  item: CatalogItem;
  isSaved?: boolean;
  onToggleSaved?: (id: string) => void;
  rank?: number;
}

export function MediaCard({
  item,
  isSaved = false,
  onToggleSaved,
  rank,
}: MediaCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const hasDub = item.streams.some((s) => s.audio === "dub");
  const hasLeg = item.streams.some((s) => s.audio === "leg");
  const detailPath = item.type === "f" ? `/filme/${item.id}` : `/serie/${item.id}`;

  return (
    <article className="ydo-card" data-rank={rank}>
      {rank !== undefined && (
        <span className="ydo-card-rank" aria-hidden="true">
          {rank}
        </span>
      )}

      <Link to={detailPath} className="ydo-card-poster-link" tabIndex={-1}>
        <div className="ydo-card-poster">
          {!imgFailed && item.posterUrl ? (
            <img
              src={item.posterUrl}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="ydo-card-img"
              draggable={false}
            />
          ) : (
            <div className="ydo-card-fallback" aria-hidden="true">
              <span>{item.title.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div className="ydo-card-shade" />

          {/* Hover overlay */}
          <div className="ydo-card-hover">
            <Link
              to={detailPath}
              className="ydo-card-play-btn"
              aria-label={`Assistir ${item.title}`}
            >
              <Play size={18} fill="currentColor" />
            </Link>
            <button
              className="ydo-card-action-btn"
              onClick={(e) => {
                e.preventDefault();
                onToggleSaved?.(item.id);
              }}
              aria-label={
                isSaved
                  ? `Remover ${item.title} da lista`
                  : `Adicionar ${item.title} à lista`
              }
            >
              {isSaved ? <Check size={15} /> : <Plus size={15} />}
            </button>
          </div>

          {/* Selos */}
          <div className="ydo-card-badges">
            {hasDub && <span className="ydo-badge">DUB</span>}
            {hasLeg && <span className="ydo-badge ydo-badge-leg">LEG</span>}
          </div>
        </div>
      </Link>

      <div className="ydo-card-info">
        <Link to={detailPath} className="ydo-card-title">
          {cleanDisplayTitle(item.title)}
        </Link>
        <div className="ydo-card-meta">
          {item.tmdb?.releaseYear && <span>{item.tmdb.releaseYear}</span>}
          {item.tmdb?.voteAverage ? (
            <span className="ydo-card-rating">
              <Star size={11} fill="currentColor" aria-hidden />
              {item.tmdb.voteAverage.toFixed(1)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
