import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Star, Tv, Check, Plus, X, Users, Layers, Clapperboard } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
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

    fetch(`/api/item?id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erro");
        return res.json() as Promise<CatalogItem>;
      })
      .then((found) => {
        if (!active) return;
        setSerie(found);
        setSaved(getSavedList().includes(found.id));
      })
      .catch(() => {
        fetch("/api/catalogo")
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
      <main style={{ minHeight: "100vh", backgroundColor: "#060608", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "min(92vw, 1080px)", height: "680px", borderRadius: "24px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }} className="skeleton" />
      </main>
    );
  }

  if (!serie) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#060608", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#fff", textAlign: "center", padding: "24px" }}>
        <Tv size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Série não localizada</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>Esta série não faz parte do catálogo atual.</p>
        <button onClick={closeDialog} style={{ padding: "10px 24px", borderRadius: "999px", background: "#e8b44a", color: "#000", fontWeight: "700", border: "none", cursor: "pointer" }}>
          Voltar ao Catálogo
        </button>
      </main>
    );
  }

  const cast = serie.tmdb?.cast || [];
  const backdrop = serie.tmdb?.backdropUrl || serie.posterUrl?.replace("/w342", "/original") || "";
  const poster = serie.posterUrl?.replace("/w342", "/w500") || "";

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "rgba(3, 3, 5, 0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", position: "relative" }}>
      {/* Container Card Modal de Luxo (Design Refinado) */}
      <div style={{
        position: "relative",
        width: "min(94vw, 1080px)",
        maxHeight: "92vh",
        overflowY: "auto",
        backgroundColor: "#0d0e15",
        borderRadius: "28px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: "0 30px 90px rgba(0, 0, 0, 0.8)",
        color: "#fff",
      }}>
        {/* Botão Fechar no Canto Superior Direito */}
        <button
          onClick={closeDialog}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            zIndex: 30,
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            backgroundColor: "rgba(10, 11, 20, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backdropFilter: "blur(12px)",
            transition: "transform 0.2s, background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
            e.currentTarget.style.backgroundColor = "rgba(232, 180, 74, 0.9)";
            e.currentTarget.style.color = "#000";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.backgroundColor = "rgba(10, 11, 20, 0.75)";
            e.currentTarget.style.color = "#fff";
          }}
        >
          <X size={20} />
        </button>

        {/* Banner de Topo com Backdrop Cinemático */}
        <div style={{
          position: "relative",
          width: "100%",
          height: "220px",
          overflow: "hidden",
          borderTopLeftRadius: "28px",
          borderTopRightRadius: "28px",
          backgroundColor: "#111320",
        }}>
          {backdrop ? (
            <img
              src={backdrop}
              alt={serie.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 25%",
                filter: "brightness(0.65)",
              }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1b1e32, #0d0e15)" }} />
          )}
          {/* Gradiente escurecendo a base do banner */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, #0d0e15 0%, rgba(13, 14, 21, 0.5) 60%, transparent 100%)",
          }} />
        </div>

        {/* Conteúdo Principal do Modal */}
        <div style={{ padding: "0 32px 32px", marginTop: "-90px", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", flexDirection: "row", gap: "28px", alignItems: "flex-end", flexWrap: "wrap" }}>
            {/* Pôster Proporcional (180x260) */}
            <div style={{
              width: "180px",
              height: "260px",
              flexShrink: 0,
              borderRadius: "16px",
              overflow: "hidden",
              border: "2px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 16px 36px rgba(0, 0, 0, 0.7)",
              backgroundColor: "#161826",
            }}>
              {poster ? (
                <img
                  src={poster}
                  alt={serie.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)" }}>
                  Sem Pôster
                </div>
              )}
            </div>

            {/* Cabeçalho com Título, Badges e Botões de Ação */}
            <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(232, 180, 74, 0.15)",
                  border: "1px solid rgba(232, 180, 74, 0.4)",
                  color: "#e8b44a",
                  fontSize: "0.75rem",
                  fontWeight: "800",
                  letterSpacing: "0.08em",
                }}>
                  SÉRIE
                </span>

                {serie.tmdb?.releaseYear && (
                  <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", fontWeight: "500" }}>
                    {serie.tmdb.releaseYear}
                  </span>
                )}

                {serie.tmdb?.voteAverage ? (
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.85rem",
                    fontWeight: "700",
                    color: "#e8b44a",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    padding: "2px 8px",
                    borderRadius: "6px",
                  }}>
                    <Star size={13} fill="#e8b44a" /> {serie.tmdb.voteAverage.toFixed(1)}
                  </span>
                ) : null}

                <span style={{
                  fontSize: "0.75rem",
                  color: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}>
                  HD
                </span>
              </div>

              <h1 style={{
                fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
                fontWeight: "900",
                lineHeight: "1.15",
                margin: 0,
                letterSpacing: "-0.02em",
                textShadow: "0 2px 10px rgba(0,0,0,0.5)",
              }}>
                {serie.title}
              </h1>

              {/* Botões de Ação estilo Pill */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                <Link
                  to={`/assistir/serie/${serie.id}/${selectedSeason}/1`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "10px",
                    backgroundColor: "#ffffff",
                    color: "#0a0b14",
                    padding: "12px 28px",
                    borderRadius: "999px",
                    fontWeight: "800",
                    fontSize: "0.95rem",
                    textDecoration: "none",
                    boxShadow: "0 8px 24px rgba(255,255,255,0.2)",
                    transition: "transform 0.2s, background-color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e8b44a")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ffffff")}
                >
                  <Play size={18} fill="#0a0b14" />
                  Assistir T{selectedSeason}:E1
                </Link>

                <button
                  onClick={toggleSave}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: saved ? "rgba(232, 180, 74, 0.2)" : "rgba(255, 255, 255, 0.08)",
                    border: saved ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.15)",
                    color: saved ? "#e8b44a" : "#ffffff",
                    padding: "12px 22px",
                    borderRadius: "999px",
                    fontWeight: "600",
                    fontSize: "0.9rem",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {saved ? <Check size={18} /> : <Plus size={18} />}
                  {saved ? "Salvo na Lista" : "Minha Lista"}
                </button>
              </div>
            </div>
          </div>

          {/* Gêneros */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", margin: "24px 0 16px" }}>
            {serie.genres.map((g) => (
              <span
                key={g}
                style={{
                  padding: "4px 12px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  fontSize: "0.8rem",
                  color: "rgba(255, 255, 255, 0.75)",
                }}
              >
                {g}
              </span>
            ))}
          </div>

          {/* Sinopse */}
          <div style={{ margin: "16px 0 28px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#e8b44a", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Sinopse
            </h3>
            <p style={{
              fontSize: "0.95rem",
              lineHeight: "1.65",
              color: "rgba(255, 255, 255, 0.8)",
              margin: 0,
              maxWidth: "850px",
            }}>
              {serie.tmdb?.overview || "Sinopse em atualização via catálogo Saimo TV."}
            </p>
          </div>

          {/* Seletor de Temporadas e Episódios */}
          <div style={{ margin: "28px 0", padding: "20px", borderRadius: "18px", backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Layers size={20} style={{ color: "#e8b44a" }} />
              <h3 style={{ fontSize: "1rem", fontWeight: "800", color: "#fff", margin: 0 }}>
                Episódios & Temporadas
              </h3>
            </div>

            {/* Temporadas disponíveis */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].slice(0, serie.seasons?.length || 1).map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSeason(s)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: "700",
                    border: selectedSeason === s ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: selectedSeason === s ? "#e8b44a" : "rgba(255, 255, 255, 0.05)",
                    color: selectedSeason === s ? "#0a0b14" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  Temporada {s}
                </button>
              ))}
            </div>

            {/* Grid de Episódios rápidos */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px" }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((ep) => (
                <Link
                  key={ep}
                  to={`/assistir/serie/${serie.id}/${selectedSeason}/${ep}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "#fff",
                    textDecoration: "none",
                    fontSize: "0.85rem",
                    fontWeight: "600",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(232, 180, 74, 0.15)";
                    e.currentTarget.style.borderColor = "#e8b44a";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                  }}
                >
                  <Clapperboard size={15} style={{ color: "#e8b44a" }} />
                  Episódio {ep}
                </Link>
              ))}
            </div>
          </div>

          {/* Elenco com Fotos Circulares */}
          {cast.length > 0 && (
            <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <Users size={18} style={{ color: "#e8b44a" }} />
                <h3 style={{ fontSize: "0.95rem", fontWeight: "700", color: "#fff", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Elenco Principal
                </h3>
              </div>

              <div style={{
                display: "flex",
                gap: "16px",
                overflowX: "auto",
                paddingBottom: "12px",
                scrollbarWidth: "thin",
              }}>
                {cast.slice(0, 10).map((actor) => (
                  <div
                    key={actor.id}
                    style={{
                      flex: "0 0 110px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "8px",
                    }}
                  >
                    <div style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "2px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "#1b1e32",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
                    }}>
                      {actor.profilePath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                          alt={actor.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: "bold", color: "rgba(255,255,255,0.4)" }}>
                          {actor.name.slice(0, 2)}
                        </div>
                      )}
                    </div>

                    <span style={{ fontSize: "0.8rem", fontWeight: "700", color: "#fff", lineHeight: "1.2", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {actor.name}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "rgba(255, 255, 255, 0.5)", lineHeight: "1.2", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                      {actor.character}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
