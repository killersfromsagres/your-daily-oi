import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Heart, Star, X, Film, Check, Users } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { CatalogItem } from "@/lib/types";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/filme/$id")({
  component: MovieDetailPage,
  head: () => ({ meta: [{ title: "Detalhes do Filme — Zang Flix" }] }),
});

function MovieDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<CatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

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
        setMovie(found);
        setSaved(getSavedList().includes(found.id));
      })
      .catch(() => {
        fetch("/api/catalogo")
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
      <main style={{ minHeight: "100vh", backgroundColor: "#060608", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "min(92vw, 1080px)", height: "680px", borderRadius: "24px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }} className="skeleton" />
      </main>
    );
  }

  if (!movie) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#060608", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#fff", textAlign: "center", padding: "24px" }}>
        <Film size={48} style={{ color: "#e8b44a" }} />
        <h1 style={{ fontSize: "1.75rem", fontWeight: "800" }}>Filme não localizado</h1>
        <p style={{ color: "rgba(255,255,255,0.6)" }}>Este título não está disponível no catálogo atual.</p>
        <button onClick={closeDialog} style={{ padding: "10px 24px", borderRadius: "999px", background: "#e8b44a", color: "#000", fontWeight: "700", border: "none", cursor: "pointer" }}>
          Voltar ao Catálogo
        </button>
      </main>
    );
  }

  const cast = movie.tmdb?.cast || [];
  const backdrop = movie.tmdb?.backdropUrl || movie.posterUrl?.replace("/w342", "/original") || "";
  const poster = movie.posterUrl?.replace("/w342", "/w500") || "";

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "rgba(3, 3, 5, 0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", position: "relative" }}>
      {/* Container Card Modal de Altíssima Fidelidade (Referência Saimo TV) */}
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
            backdropFilter: "blur(10px)",
            transition: "all 0.2s ease"
          }}
        >
          <X size={20} />
        </button>

        {/* Banner Hero Superior com Backdrop e Informações */}
        <div style={{
          position: "relative",
          minHeight: "440px",
          display: "flex",
          alignItems: "flex-end",
          padding: "clamp(24px, 4vw, 48px)",
          overflow: "hidden"
        }}>
          {/* Imagem de Fundo Panorâmica */}
          {backdrop && (
            <div style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${backdrop})`,
              backgroundSize: "cover",
              backgroundPosition: "center 25%",
              filter: "brightness(0.55)",
              zIndex: 1
            }} />
          )}

          {/* Gradientes Suaves de Integração */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to right, rgba(13, 14, 21, 0.95) 0%, rgba(13, 14, 21, 0.7) 40%, rgba(13, 14, 21, 0.2) 75%, transparent 100%)",
            zIndex: 2
          }} />
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, #0d0e15 0%, rgba(13, 14, 21, 0.8) 25%, transparent 70%)",
            zIndex: 2
          }} />

          {/* Conteúdo Superior: Pôster + Texto */}
          <div style={{ position: "relative", zIndex: 10, display: "flex", gap: "28px", alignItems: "flex-end", width: "100%", flexWrap: "wrap" }}>
            {/* Pôster com cantos arredondados padronizado */}
            <div style={{
              width: "180px",
              height: "260px",
              flexShrink: 0,
              borderRadius: "16px",
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
              backgroundColor: "#161824"
            }}>
              {poster ? (
                <img src={poster} alt={movie.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontWeight: "bold" }}>
                  SEM PÔSTER
                </div>
              )}
            </div>

            {/* Informações Textuais e Botões */}
            <div style={{ flex: "1 1 340px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: "800", letterSpacing: "0.14em", color: "#4fe3d0", textTransform: "uppercase" }}>
                FILME
              </span>

              <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: "900", letterSpacing: "-0.03em", lineHeight: "1.1", margin: 0, color: "#fff" }}>
                {movie.title}
              </h1>

              {movie.tmdb?.overview && (
                <p style={{ fontSize: "0.95rem", fontStyle: "italic", color: "rgba(255, 255, 255, 0.7)", margin: "2px 0 6px 0", maxWidth: "600px" }}>
                  {movie.tmdb.overview.slice(0, 110)}...
                </p>
              )}

              {/* Badges de Metadados: Nota, Ano, Duração, Classificação */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "0.85rem", fontWeight: "600" }}>
                {movie.tmdb?.voteAverage ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: "#f59e0b", color: "#000", padding: "2px 8px", borderRadius: "6px", fontWeight: "800" }}>
                    ★ {movie.tmdb.voteAverage.toFixed(1)}
                  </span>
                ) : null}
                {movie.tmdb?.releaseYear && (
                  <span style={{ backgroundColor: "rgba(255, 255, 255, 0.1)", padding: "2px 8px", borderRadius: "6px" }}>
                    {movie.tmdb.releaseYear}
                  </span>
                )}
                <span style={{ backgroundColor: "rgba(255, 255, 255, 0.1)", padding: "2px 8px", borderRadius: "6px" }}>
                  HD / 4K
                </span>
                <span style={{ backgroundColor: "#10b981", color: "#000", padding: "2px 7px", borderRadius: "6px", fontWeight: "800" }}>
                  14
                </span>
                <span style={{ color: "rgba(255, 255, 255, 0.6)", marginLeft: "4px" }}>
                  {movie.genres?.join(" • ")}
                </span>
              </div>

              {/* Botões de Ação Principais */}
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "14px", flexWrap: "wrap" }}>
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
                    transition: "all 0.2s ease"
                  }}
                >
                  <Play size={18} fill="currentColor" />
                  Assistir
                </Link>

                <button
                  onClick={toggleSave}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.12)",
                    color: "#ffffff",
                    padding: "12px 24px",
                    borderRadius: "14px",
                    fontWeight: "700",
                    fontSize: "0.95rem",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  {saved ? <Check size={18} /> : <Heart size={18} />}
                  {saved ? "Na Minha Lista" : "Favoritar"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sinopse Completa e Dados de Produção */}
        <div style={{ padding: "0 clamp(24px, 4vw, 48px) 32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <p style={{ fontSize: "1rem", lineHeight: "1.7", color: "rgba(255, 255, 255, 0.85)", maxWidth: "880px", margin: 0 }}>
            {movie.tmdb?.overview || "Sinopse em atualização oficial via acervo Saimo TV."}
          </p>

          {/* Caixa de Fontes e Versões Disponíveis */}
          <div style={{
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "18px",
            padding: "20px 24px"
          }}>
            <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "rgba(255, 255, 255, 0.6)", display: "block", marginBottom: "12px" }}>
              Fontes e versões disponíveis ({movie.streams.length}):
            </span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {movie.streams.map((stream, idx) => (
                <Link
                  key={idx}
                  to={`/assistir/filme/${movie.id}`}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "10px",
                    padding: "8px 16px",
                    fontSize: "0.82rem",
                    color: "#fff",
                    textDecoration: "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span style={{ fontWeight: "700" }}>Fonte {idx + 1}</span>
                  <span style={{ fontSize: "0.7rem", color: stream.audio === "dub" ? "#4fe3d0" : "#a78bfa" }}>
                    {stream.audio === "dub" ? "Dublado" : "Legendado"}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Seção Elenco em Grid Horizontal com Fotos Redondas Estilo Saimo */}
          {cast.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", color: "#fff", fontWeight: "800", fontSize: "1.2rem" }}>
                <Users size={20} style={{ color: "#e8b44a" }} />
                <span>Elenco</span>
              </div>

              <div style={{
                display: "flex",
                gap: "20px",
                overflowX: "auto",
                paddingBottom: "12px",
                scrollbarWidth: "none"
              }}>
                {cast.map((actor) => (
                  <div
                    key={actor.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      width: "90px",
                      flexShrink: 0,
                      gap: "8px"
                    }}
                  >
                    <div style={{
                      width: "68px",
                      height: "68px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "2px solid rgba(255, 255, 255, 0.12)",
                      backgroundColor: "#161824",
                      boxShadow: "0 6px 16px rgba(0, 0, 0, 0.4)"
                    }}>
                      {actor.profilePath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                          alt={actor.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "1.1rem", color: "rgba(255,255,255,0.4)" }}>
                          {actor.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div>
                      <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "#fff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: "1.2" }}>
                        {actor.name}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "rgba(255, 255, 255, 0.5)", display: "block", marginTop: "2px" }}>
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
    </main>
  );
}
