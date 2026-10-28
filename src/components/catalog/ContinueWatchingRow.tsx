"use client";
import { useState } from "react";
import { Play, X, RotateCcw, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { WatchProgress } from "@/lib/types";

interface ContinueWatchingRowProps {
  items: WatchProgress[];
  onRemove: (id: string) => void;
  title?: string;
  eyebrow?: string;
}

function getResumeLink(p: WatchProgress): string {
  const baseId = p.contentId || p.id.replace(/-t\d+-e\d+$/, "");
  if (p.type === "f") {
    return `/assistir/filme/${encodeURIComponent(baseId)}`;
  }
  if (p.type === "s") {
    const s = p.season || 1;
    const e = p.episode || 1;
    return `/assistir/serie/${encodeURIComponent(baseId)}/${s}/${e}`;
  }
  const s = p.season || 1;
  const e = p.episode || 1;
  return `/assistir/anime/${encodeURIComponent(baseId)}/${s}/${e}`;
}

function formatDuration(sec: number): string {
  if (!sec || !isFinite(sec)) return "0m";
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}h ${m % 60}m`;
  }
  return `${m} min`;
}

export function ContinueWatchingRow({
  items,
  onRemove,
  title = "Continuar Assistindo",
  eyebrow = "Retomar de onde parou",
}: ContinueWatchingRowProps) {
  if (!items.length) return null;

  return (
    <section className="ydo-row-section" style={{ marginBottom: "28px" }}>
      <div className="ydo-row-header">
        <div>
          {eyebrow && <span className="ydo-row-eyebrow" style={{ color: "#e8b44a" }}>{eyebrow}</span>}
          <h2 className="ydo-row-title">{title}</h2>
        </div>
      </div>

      <div className="ydo-row-track" style={{ gap: "16px", paddingBottom: "12px" }}>
        {items.map((item) => {
          const resumeUrl = getResumeLink(item);
          const hasDuration = item.duration && item.duration > 0;
          const pct = hasDuration
            ? Math.min(100, Math.max(5, Math.round((item.currentTime / item.duration!) * 100)))
            : 30; // estimativa elegante se duração ainda desconhecida

          const typeLabel =
            item.type === "f"
              ? "FILME"
              : item.season && item.episode
                ? `T${item.season}:E${item.episode}`
                : item.type === "a"
                  ? "ANIME"
                  : "SÉRIE";

          return (
            <div
              key={item.id}
              className="ydo-continue-card"
              style={{
                position: "relative",
                width: "220px",
                flexShrink: 0,
                borderRadius: "14px",
                overflow: "hidden",
                backgroundColor: "#121422",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
                display: "flex",
                flexDirection: "column",
                transition: "transform 0.25s ease, border-color 0.25s ease",
              }}
            >
              {/* Thumbnail / Pôster com Overlay */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16/10",
                  backgroundColor: "#0d0f19",
                  overflow: "hidden",
                }}
              >
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#161826",
                      color: "rgba(255, 255, 255, 0.4)",
                      fontWeight: "700",
                    }}
                  >
                    {item.title.slice(0, 2).toUpperCase()}
                  </div>
                )}

                {/* Sombra Gradiente Inferior */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(18,20,34,0.95) 0%, rgba(18,20,34,0.3) 50%, rgba(0,0,0,0.6) 100%)",
                  }}
                />

                {/* Badge de Temporada / Tipo */}
                <div
                  style={{
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    backgroundColor: "rgba(10, 11, 20, 0.85)",
                    border: "1px solid rgba(232, 180, 74, 0.4)",
                    color: "#e8b44a",
                    fontSize: "0.68rem",
                    fontWeight: "800",
                    padding: "2px 7px",
                    borderRadius: "6px",
                    letterSpacing: "0.05em",
                  }}
                >
                  {typeLabel}
                </div>

                {/* Botão de Remover do Histórico */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  title="Remover de continuar assistindo"
                  aria-label={`Remover ${item.title}`}
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    backgroundColor: "rgba(0, 0, 0, 0.65)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "rgba(255, 255, 255, 0.75)",
                    borderRadius: "50%",
                    width: "26px",
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <X size={14} />
                </button>

                {/* Botão Play Central em Link */}
                <Link
                  to={resumeUrl}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(232, 180, 74, 0.9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#0a0b14",
                      boxShadow: "0 4px 15px rgba(232, 180, 74, 0.4)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    <Play size={20} fill="#0a0b14" style={{ marginLeft: "2px" }} />
                  </div>
                </Link>

                {/* Barra de Progresso no Rodapé da Thumbnail */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "4px",
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      backgroundColor: "#e8b44a",
                      boxShadow: "0 0 8px #e8b44a",
                    }}
                  />
                </div>
              </div>

              {/* Informações Textuais e Botão de Ação */}
              <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <h3
                  title={item.title}
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: "700",
                    margin: 0,
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.title}
                </h3>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.72rem",
                    color: "rgba(255, 255, 255, 0.55)",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} style={{ color: "#e8b44a" }} />
                    {item.currentTime > 0 ? formatDuration(item.currentTime) : "Começado"}
                  </span>
                  <span>{pct}% concluído</span>
                </div>

                <Link
                  to={resumeUrl}
                  style={{
                    marginTop: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(232, 180, 74, 0.12)",
                    border: "1px solid rgba(232, 180, 74, 0.35)",
                    color: "#e8b44a",
                    fontSize: "0.78rem",
                    fontWeight: "700",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <RotateCcw size={13} />
                  Retomar
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
