import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Heart, Star, X, Film, Check, Users, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { CatalogItem, StreamSource } from "@/lib/types";
import { cleanDisplayTitle, detectQuality } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/filme/$id")({
  component: MovieDetailPage,
  head: () => ({ meta: [{ title: "Detalhes do Filme — Zang Flix" }] }),
});

function formatRuntime(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "1h 55min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function MovieDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<CatalogItem | null>(null);
  const [extraStreams, setExtraStreams] = useState<StreamSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.allSettled([
      fetch(`/api/item?id=${encodeURIComponent(id)}&tipo=movie`, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<CatalogItem>;
      }),
      fetch(`/api/resolve-vod?id=${encodeURIComponent(id)}&tipo=movie`, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<{ sources?: StreamSource[] }>;
      }),
    ])
      .then(([itemRes, resolveRes]) => {
        if (!active) return;
        if (itemRes.status === "fulfilled" && itemRes.value && !(itemRes.value as any).error) {
          const found = itemRes.value as CatalogItem;
          setMovie(found);
          setSaved(getSavedList().includes(found.id));
        }
        if (resolveRes.status === "fulfilled" && resolveRes.value?.sources) {
          setExtraStreams(resolveRes.value.sources);
        }
      })
      .catch(() => {
        fetch("/api/catalogo", { cache: "no-store" })
          .then((r) => r.json() as Promise<{ items: CatalogItem[] }>)
          .then((d) => {
            if (!active) return;
            const f = d.items.find((i) => i.id === id);
            setMovie(f || null);
            if (f) setSaved(getSavedList().includes(f.id));
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

  const toggleSave = () => {
    if (!movie) return;
    toggleSavedStorage(movie.id);
    setSaved(!saved);
  };

  const closeDialog = () => {
    void navigate({ to: "/" });
  };

  if (loading) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(6, 7, 13, 0.94)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(16px)"
      }}>
        <div style={{
          width: "min(92vw, 1080px)",
          height: "640px",
          borderRadius: "24px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)"
        }} className="skeleton" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(6, 7, 13, 0.94)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        color: "#fff",
        textAlign: "center",
        padding: "24px",
        backdropFilter: "blur(16px)"
      }}>
        <Film size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Filme não localizado</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>Este título não está disponível no catálogo atual.</p>
        <button onClick={closeDialog} className="ydo-btn-primary">
          Voltar ao Catálogo
        </button>
      </div>
    );
  }

  const cast = movie.tmdb?.cast || [];
  // Banner de altíssima definição (original do TMDB ou poster original widescreen)
  const backdrop = movie.tmdb?.backdropUrl || movie.posterUrl?.replace("/w342", "/original") || "";
  const poster = movie.posterUrl?.replace("/w342", "/w500") || "";
  const titleDisplay = cleanDisplayTitle(movie.title);
  const runtimeDisplay = formatRuntime(movie.tmdb?.runtime);

  const movieQuality = (() => {
    if (!movie) return "FULL HD 1080P";
    const allStreams = [...(movie.streams || []), ...extraStreams];
    const qualities = allStreams
      .map((s) => s.quality || detectQuality(s.url, movie.title))
      .filter(Boolean);
    if (qualities.some((q) => /4k|2160|uhd/i.test(q)) || /4k|2160|uhd/i.test(movie.title)) return "4K ULTRA HD";
    if (qualities.some((q) => /2k|1440|qhd/i.test(q)) || /2k|1440|qhd/i.test(movie.title)) return "2K QUAD HD";
    if (qualities.some((q) => /720|720p/i.test(q)) && !qualities.some((q) => /1080|fhd/i.test(q))) return "HD 720P";
    if (qualities.some((q) => /480|480p|sd/i.test(q)) && !qualities.some((q) => /1080|720/i.test(q))) return "SD 480P";
    return "FULL HD 1080P";
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(4, 5, 10, 0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "clamp(16px, 4vw, 40px) 16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      {/* Container Principal do Filme */}
      <div
        style={{
          position: "relative",
          width: "min(96vw, 1080px)",
          backgroundColor: "#0d0e17",
          borderRadius: "28px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 30px 100px rgba(0, 0, 0, 0.85)",
          color: "#fff",
          overflow: "hidden",
          margin: "auto",
        }}
      >
        {/* Botão Fechar no Canto Superior Direito */}
        <button
          onClick={closeDialog}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            zIndex: 40,
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            backgroundColor: "rgba(10, 11, 20, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(12px)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(232, 180, 74, 0.9)";
            e.currentTarget.style.color = "#000";
            e.currentTarget.style.transform = "scale(1.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(10, 11, 20, 0.8)";
            e.currentTarget.style.color = "#ffffff";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <X size={20} />
        </button>

        {/* Banner de Altíssima Definição com Desfoque Profundo Cinematográfico */}
        <div
          style={{
            position: "relative",
            minHeight: "460px",
            display: "flex",
            alignItems: "flex-end",
            padding: "clamp(24px, 4vw, 48px)",
            overflow: "hidden",
          }}
        >
          {/* Fundo de Alta Resolução com Efeito Desfocado Suave */}
          {backdrop && (
            <div
              style={{
                position: "absolute",
                inset: "-20px",
                backgroundImage: `url(${backdrop})`,
                backgroundSize: "cover",
                backgroundPosition: "center 30%",
                filter: "blur(14px) brightness(0.55)",
                transform: "scale(1.08)",
                zIndex: 1,
              }}
            />
          )}

          {/* Gradientes Suaves de Integração com o Container */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to right, rgba(13, 14, 23, 0.98) 0%, rgba(13, 14, 23, 0.75) 45%, rgba(13, 14, 23, 0.35) 80%, transparent 100%)",
              zIndex: 2,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to top, #0d0e17 0%, rgba(13, 14, 23, 0.85) 30%, transparent 75%)",
              zIndex: 2,
            }}
          />

          {/* Conteúdo em Primeiro Plano: Pôster + Metadados + Botões */}
          <div
            style={{
              position: "relative",
              zIndex: 10,
              display: "flex",
              gap: "28px",
              alignItems: "flex-end",
              width: "100%",
              flexWrap: "wrap",
            }}
          >
            {/* Pôster Proporcional de Luxo */}
            <div
              style={{
                width: "185px",
                height: "270px",
                flexShrink: 0,
                borderRadius: "18px",
                overflow: "hidden",
                border: "2px solid rgba(255, 255, 255, 0.18)",
                boxShadow: "0 20px 45px rgba(0, 0, 0, 0.7)",
                backgroundColor: "#161826",
              }}
            >
              {poster ? (
                <img
                  src={poster}
                  alt={titleDisplay}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.3)",
                    fontWeight: "bold",
                  }}
                >
                  SEM PÔSTER
                </div>
              )}
            </div>

            {/* Informações Principais */}
            <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "800",
                    letterSpacing: "0.12em",
                    color: "#e8b44a",
                    backgroundColor: "rgba(232, 180, 74, 0.15)",
                    border: "1px solid rgba(232, 180, 74, 0.4)",
                    padding: "3px 10px",
                    borderRadius: "6px",
                    textTransform: "uppercase",
                  }}
                >
                  FILME
                </span>

                {/* Badge de Qualidade Real Exibida */}
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "800",
                    letterSpacing: "0.06em",
                    color: movieQuality.includes("4K") ? "#e8b44a" : "#ffffff",
                    backgroundColor: movieQuality.includes("4K") ? "rgba(232, 180, 74, 0.15)" : "rgba(255, 255, 255, 0.12)",
                    border: movieQuality.includes("4K") ? "1px solid rgba(232, 180, 74, 0.4)" : "1px solid rgba(255, 255, 255, 0.25)",
                    padding: "3px 9px",
                    borderRadius: "6px",
                  }}
                >
                  {movieQuality}
                </span>

                {/* Badge de Duração */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    color: "rgba(255, 255, 255, 0.85)",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  <Clock size={12} style={{ color: "#e8b44a" }} />
                  {runtimeDisplay}
                </span>

                {/* Nota do Filme */}
                {movie.tmdb?.voteAverage ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      backgroundColor: "#f59e0b",
                      color: "#000",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontWeight: "800",
                      fontSize: "0.8rem",
                    }}
                  >
                    ★ {movie.tmdb.voteAverage.toFixed(1)}
                  </span>
                ) : null}

                {/* Ano de Lançamento */}
                {movie.tmdb?.releaseYear && (
                  <span
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      color: "rgba(255, 255, 255, 0.8)",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: "600",
                    }}
                  >
                    {movie.tmdb.releaseYear}
                  </span>
                )}
              </div>

              {/* Título Limpo */}
              <h1
                style={{
                  fontSize: "clamp(1.8rem, 3.8vw, 2.8rem)",
                  fontWeight: "900",
                  letterSpacing: "-0.03em",
                  lineHeight: "1.15",
                  margin: 0,
                  color: "#fff",
                }}
              >
                {titleDisplay}
              </h1>

              {/* Chips Profissionais de Gêneros */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", margin: "2px 0 6px 0" }}>
                {movie.genres?.map((genre) => (
                  <span
                    key={genre}
                    style={{
                      padding: "3px 12px",
                      borderRadius: "999px",
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.14)",
                      fontSize: "0.78rem",
                      fontWeight: "500",
                      color: "rgba(255, 255, 255, 0.85)",
                    }}
                  >
                    {genre}
                  </span>
                ))}
              </div>

              {/* Botões de Ação Personalizados e Modernos */}
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px", flexWrap: "wrap" }}>
                <Link
                  to={`/assistir/filme/${movie.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "#ffffff",
                    color: "#0a0b14",
                    padding: "12px 28px",
                    borderRadius: "14px",
                    fontWeight: "800",
                    fontSize: "0.95rem",
                    textDecoration: "none",
                    boxShadow: "0 8px 24px rgba(255, 255, 255, 0.25)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#e8b44a";
                    e.currentTarget.style.transform = "scale(1.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ffffff";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <Play size={18} fill="currentColor" />
                  Assistir Filme
                </Link>

                <button
                  onClick={toggleSave}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: saved ? "rgba(232, 180, 74, 0.2)" : "rgba(255, 255, 255, 0.1)",
                    color: saved ? "#e8b44a" : "#ffffff",
                    padding: "12px 24px",
                    borderRadius: "14px",
                    fontWeight: "700",
                    fontSize: "0.95rem",
                    border: saved ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.18)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {saved ? <Check size={18} /> : <Heart size={18} />}
                  {saved ? "Na Minha Lista" : "Minha Lista"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sinopse Completa e Elenco */}
        <div style={{ padding: "0 clamp(24px, 4vw, 48px) 36px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: "700",
                color: "#e8b44a",
                marginBottom: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Sinopse
            </h3>
            <p
              style={{
                fontSize: "1rem",
                lineHeight: "1.7",
                color: "rgba(255, 255, 255, 0.85)",
                maxWidth: "880px",
                margin: 0,
              }}
            >
              {movie.tmdb?.overview?.trim() ||
                `Acompanhe a história emocionante de ${titleDisplay}. Uma produção em alta resolução disponível no Zang Flix.`}
            </p>
          </div>

          {/* Elenco com Fotos Circulares e Nomes */}
          {cast.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "16px",
                  color: "#fff",
                  fontWeight: "800",
                  fontSize: "1.1rem",
                }}
              >
                <Users size={20} style={{ color: "#e8b44a" }} />
                <span>Elenco Principal</span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  overflowX: "auto",
                  paddingBottom: "12px",
                  scrollbarWidth: "none",
                }}
              >
                {cast.slice(0, 12).map((actor) => (
                  <div
                    key={actor.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      width: "90px",
                      flexShrink: 0,
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "68px",
                        height: "68px",
                        borderRadius: "50%",
                        overflow: "hidden",
                        border: "2px solid rgba(255, 255, 255, 0.14)",
                        backgroundColor: "#161824",
                        boxShadow: "0 6px 16px rgba(0, 0, 0, 0.4)",
                      }}
                    >
                      {actor.profilePath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                          alt={actor.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          loading="lazy"
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "700",
                            fontSize: "1.1rem",
                            color: "rgba(255,255,255,0.4)",
                          }}
                        >
                          {actor.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: "700",
                          color: "#fff",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          lineHeight: "1.2",
                        }}
                      >
                        {actor.name}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "rgba(255, 255, 255, 0.5)",
                          display: "block",
                          marginTop: "2px",
                        }}
                      >
                        {actor.character}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
