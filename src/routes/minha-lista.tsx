import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Heart, Trash2, Play, Film, Tv, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { MediaCard } from "@/components/catalog/MediaCard";
import { SkeletonRow } from "@/components/catalog/SkeletonRow";
import type { CatalogItem } from "@/lib/types";
import { getSavedList, toggleSaved as toggleSavedStorage } from "@/lib/storage";

export const Route = createFileRoute("/minha-lista")({
  component: MyListPage,
  head: () => ({ meta: [{ title: "Minha Lista — Zang Flix" }] }),
});

function MyListPage() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "f" | "s">("all");

  useEffect(() => {
    setSavedIds(getSavedList());
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/catalogo", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao buscar catálogo");
        return res.json() as Promise<{ items: CatalogItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        setAllItems(data.items || []);
      })
      .catch((err) => console.error("Erro na minha lista:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const savedItems = useMemo(() => {
    const idSet = new Set(savedIds);
    return allItems.filter((item) => idSet.has(item.id));
  }, [allItems, savedIds]);

  const filteredItems = useMemo(() => {
    if (filterType === "all") return savedItems;
    return savedItems.filter((item) => item.type === filterType);
  }, [savedItems, filterType]);

  const handleToggleSaved = (id: string) => {
    toggleSavedStorage(id);
    const updated = getSavedList();
    setSavedIds(updated);
  };

  const moviesCount = savedItems.filter((i) => i.type === "f").length;
  const seriesCount = savedItems.filter((i) => i.type === "s").length;

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0b14",
        color: "#ffffff",
        padding: "clamp(80px, 12vh, 120px) clamp(16px, 4vw, 48px) 60px",
      }}
    >
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Cabeçalho da Minha Lista */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "20px",
            marginBottom: "32px",
            paddingBottom: "24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Heart size={24} fill="#e8b44a" style={{ color: "#e8b44a" }} />
              <span style={{ fontSize: "0.85rem", fontWeight: "800", color: "#e8b44a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Organização Pessoal
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: "900", margin: 0, letterSpacing: "-0.03em" }}>
              Minha Lista
            </h1>
            <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "0.95rem", margin: "6px 0 0" }}>
              Filmes e séries que você salvou para assistir em breve.
            </p>
          </div>

          {/* Filtros: Todos / Filmes / Séries */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => setFilterType("all")}
              style={{
                padding: "8px 18px",
                borderRadius: "999px",
                fontSize: "0.85rem",
                fontWeight: "700",
                cursor: "pointer",
                border: filterType === "all" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: filterType === "all" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                color: filterType === "all" ? "#0a0b14" : "#ffffff",
                transition: "all 0.2s ease",
              }}
            >
              Todos ({savedItems.length})
            </button>
            <button
              onClick={() => setFilterType("f")}
              style={{
                padding: "8px 18px",
                borderRadius: "999px",
                fontSize: "0.85rem",
                fontWeight: "700",
                cursor: "pointer",
                border: filterType === "f" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: filterType === "f" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                color: filterType === "f" ? "#0a0b14" : "#ffffff",
                transition: "all 0.2s ease",
              }}
            >
              Filmes ({moviesCount})
            </button>
            <button
              onClick={() => setFilterType("s")}
              style={{
                padding: "8px 18px",
                borderRadius: "999px",
                fontSize: "0.85rem",
                fontWeight: "700",
                cursor: "pointer",
                border: filterType === "s" ? "1px solid #e8b44a" : "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: filterType === "s" ? "#e8b44a" : "rgba(255, 255, 255, 0.04)",
                color: filterType === "s" ? "#0a0b14" : "#ffffff",
                transition: "all 0.2s ease",
              }}
            >
              Séries ({seriesCount})
            </button>
          </div>
        </div>

        {/* Conteúdo da Lista */}
        {loading ? (
          <SkeletonRow count={8} />
        ) : filteredItems.length === 0 ? (
          <div
            style={{
              padding: "80px 24px",
              textAlign: "center",
              borderRadius: "24px",
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed rgba(255, 255, 255, 0.12)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <Heart size={48} style={{ color: "rgba(232, 180, 74, 0.4)" }} />
            <h2 style={{ fontSize: "1.4rem", fontWeight: "800", margin: 0 }}>
              Sua lista está vazia
            </h2>
            <p style={{ color: "rgba(255, 255, 255, 0.6)", maxWidth: "420px", margin: 0, fontSize: "0.95rem" }}>
              Nenhum título foi adicionado ainda. Ao encontrar um filme ou série de seu interesse, clique no botão <strong>Minha Lista</strong> para salvá-lo aqui.
            </p>
            <Link to="/" className="ydo-btn-primary" style={{ marginTop: "12px" }}>
              Explorar Catálogo <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="ydo-search-grid">
            {filteredItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                isSaved={true}
                onToggleSaved={handleToggleSaved}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
