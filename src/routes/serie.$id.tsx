import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Star, Tv, Check, Heart, X, Users, Layers, Clapperboard, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
import { cleanDisplayTitle } from "@/lib/catalog";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/serie/$id")({
  component: SeriesDetailPage,
  head: () => ({ meta: [{ title: "Detalhes da Série — Zang Flix" }] }),
});

function SeriesDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [serie, setSerie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch(`/api/item?id=${encodeURIComponent(id)}&tipo=series`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<CatalogItem>;
      })
      .then((found) => {
        if (!active) return;
        setSerie(found);
        setSaved(getSavedList().includes(found.id));
        if (found.seasons && found.seasons.length > 0) {
          setSelectedSeason(found.seasons[0].seasonNumber);
        }
      })
      .catch(() => {
        fetch("/api/catalogo", { cache: "no-store" })
          .then((r) => r.json() as Promise<{ items: CatalogItem[] }>)
          .then((d) => {
            if (!active) return;
            const f = d.items.find((i) => i.id === id);
            setSerie(f || null);
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
    if (!serie) return;
    toggleSavedStorage(serie.id);
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

  if (!serie) {
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
        <Tv size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Série não localizada</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>Esta série não faz parte do catálogo atual.</p>
        <button onClick={closeDialog} className="ydo-btn-primary">
          Voltar ao Catálogo
        </button>
      </div>
    );
  }

  const cast = serie.tmdb?.cast || [];
  const backdrop = serie.tmdb?.backdropUrl || serie.posterUrl?.replace("/w342", "/original") || "";
  const poster = serie.posterUrl?.replace("/w342", "/w500") || "";
  const titleDisplay = cleanDisplayTitle(serie.title);

  // Lista de temporadas reais do catálogo (sem temporadas fantasmas inventadas)
  const seasons = serie.seasons || [];
  const currentSeasonData = seasons.find((s) => s.seasonNumber === selectedSeason) || seasons[0];
  const episodesList = currentSeasonData?.episodes || [];

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
      {/* Container Principal da Série */}
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

        {/* Banner de Altíssima Definição com Desfoque Profundo */}
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

          {/* Gradientes Suaves de Integração */}
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
            {/* Pôster Proporcional */}
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
                  SÉRIE
                </span>

                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "800",
                    letterSpacing: "0.06em",
                    color: "#ffffff",
                    backgroundColor: "rgba(255, 255, 255, 0.12)",
                    border: "1px solid rgba(255, 255, 255, 0.25)",
                    padding: "3px 9px",
                    borderRadius: "6px",
                  }}
                >
                  FULL HD 1080P
                </span>

                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: "700",
                    color: "rgba(255, 255, 255, 0.85)",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  {seasons.length} {seasons.length === 1 ? "Temporada" : "Temporadas"}
                </span>

                {serie.tmdb?.voteAverage ? (
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
                    ★ {serie.tmdb.voteAverage.toFixed(1)}
                  </span>
                ) : null}

                {serie.tmdb?.releaseYear && (
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
                    {serie.tmdb.releaseYear}
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

              {/* Chips de Gêneros */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", margin: "2px 0 6px 0" }}>
                {serie.genres?.map((genre) => (
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

              {/* Botões de Ação */}
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px", flexWrap: "wrap" }}>
                {seasons.length > 0 ? (
                  <Link
                    to={`/assistir/serie/${serie.id}/${selectedSeason}/1`}
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
                    Assistir T{selectedSeason}:E1
                  </Link>
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      color: "rgba(255, 255, 255, 0.5)",
                      padding: "12px 24px",
                      borderRadius: "14px",
                      fontWeight: "700",
                      fontSize: "0.95rem",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      cursor: "not-allowed",
                    }}
                  >
                    <Play size={18} />
                    Episódios em preparação
                  </span>
                )}

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

        {/* Sinopse, Temporadas e Elenco */}
        <div style={{ padding: "0 clamp(24px, 4vw, 48px) 36px", display: "flex", flexDirection: "column", gap: "28px" }}>
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
              {serie.tmdb?.overview?.trim() ||
                `Acompanhe todos os episódios e temporadas de ${titleDisplay}. Uma série em alta resolução disponível no Zang Flix.`}
            </p>
          </div>

          {/* Sistema Completo de Temporadas e Episódios */}
          <div
            style={{
              padding: "24px",
              borderRadius: "20px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Layers size={20} style={{ color: "#e8b44a" }} />
              <h3 style={{ fontSize: "1.05rem", fontWeight: "800", color: "#fff", margin: 0 }}>
                Seletor de Temporadas
              </h3>
            </div>

            {seasons.length === 0 ? (
              <div
                style={{
                  padding: "2.5rem 1rem",
                  textAlign: "center",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "14px",
                  border: "1px dashed rgba(255, 255, 255, 0.1)",
                }}
              >
                <Tv size={36} style={{ color: "#e8b44a", margin: "0 auto 10px auto", opacity: 0.8 }} />
                <h4 style={{ fontSize: "1rem", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
                  Episódios ainda não sincronizados — volte em breve
                </h4>
                <p style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: "0.85rem", maxWidth: "420px", margin: "0 auto" }}>
                  Os servidores deste título estão sendo indexados no acervo. Volte em breve!
                </p>
              </div>
            ) : (
              <>
                {/* Botões das Temporadas Disponíveis */}
                <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
                  {seasons.map((s) => {
                    const isActive = selectedSeason === s.seasonNumber;
                    return (
                      <button
                        key={s.seasonNumber}
                        onClick={() => setSelectedSeason(s.seasonNumber)}
                        style={{
                          padding: "9px 18px",
                          borderRadius: "12px",
                          fontSize: "0.88rem",
                          fontWeight: "700",
                          border: isActive ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: isActive ? "#e8b44a" : "rgba(255, 255, 255, 0.06)",
                          color: isActive ? "#0a0b14" : "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.18s ease",
                          boxShadow: isActive ? "0 4px 14px rgba(232, 180, 74, 0.3)" : "none",
                        }}
                      >
                        Temporada {s.seasonNumber}
                      </button>
                    );
                  })}
                </div>

                {/* Grid dos Episódios da Temporada Selecionada */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: "10px",
                  }}
                >
                  {episodesList.map((ep) => (
                    <Link
                      key={ep.episodeNumber}
                      to={`/assistir/serie/${serie.id}/${selectedSeason}/${ep.episodeNumber}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px 14px",
                        borderRadius: "12px",
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.09)",
                        color: "#ffffff",
                        textDecoration: "none",
                        fontSize: "0.85rem",
                        fontWeight: "600",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(232, 180, 74, 0.15)";
                        e.currentTarget.style.borderColor = "#e8b44a";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.09)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      <Clapperboard size={16} style={{ color: "#e8b44a", flexShrink: 0 }} />
                      <span>Episódio {ep.episodeNumber}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Elenco Principal */}
          {cast.length > 0 && (
            <div>
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
