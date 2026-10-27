"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X, ChevronDown, Heart, Clock, Film, Tv } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { getSavedList } from "@/lib/storage";

interface HeaderProps {
  onSearch?: (q: string) => void;
}

const CATEGORIAS_FILMES = [
  { name: "Ação", slug: "acao", icon: "💥" },
  { name: "Terror", slug: "terror", icon: "👻" },
  { name: "Comédia", slug: "comedia", icon: "😂" },
  { name: "Ficção Científica", slug: "ficcao-cientifica", icon: "🚀" },
  { name: "Suspense", slug: "suspense", icon: "🔍" },
  { name: "Romance", slug: "romance", icon: "❤️" },
  { name: "Animação", slug: "animacao", icon: "✨" },
  { name: "Aventura", slug: "aventura", icon: "🗺️" },
  { name: "Fantasia", slug: "fantasia", icon: "🧙" },
  { name: "Documentário", slug: "documentario", icon: "📹" },
];

const CATEGORIAS_SERIES = [
  { name: "Drama", slug: "drama", icon: "🎭" },
  { name: "Suspense", slug: "suspense", icon: "🔍" },
  { name: "Ficção Científica", slug: "ficcao-cientifica", icon: "🚀" },
  { name: "Ação & Aventura", slug: "acao", icon: "💥" },
  { name: "Comédia", slug: "comedia", icon: "😂" },
  { name: "Crime & Mistério", slug: "crime", icon: "🕵️" },
  { name: "Animação", slug: "animacao", icon: "✨" },
  { name: "Documentário", slug: "documentario", icon: "📹" },
];

export function Header({ onSearch }: HeaderProps) {
  const [visible, setVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moviesHover, setMoviesHover] = useState(false);
  const [seriesHover, setSeriesHover] = useState(false);
  const [query, setQuery] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const moviesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Relógio personalizado em tempo real
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Monitora contagem de itens na Minha Lista
  useEffect(() => {
    const checkSaved = () => {
      setSavedCount(getSavedList().length);
    };
    checkSaved();
    const interval = setInterval(checkSaved, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-hide em idle (mouse parado por 4s)
  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!searchOpen && !moviesHover && !seriesHover) {
          setVisible(false);
        }
      }, 4000);
    };
    document.addEventListener("mousemove", show);
    document.addEventListener("touchstart", show);
    document.addEventListener("keydown", show);
    show();
    return () => {
      document.removeEventListener("mousemove", show);
      document.removeEventListener("touchstart", show);
      document.removeEventListener("keydown", show);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchOpen, moviesHover, seriesHover]);

  // Atalho "/" para focar busca e Escape para fechar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 60);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMoviesHover(false);
        setSeriesHover(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      void navigate({ to: "/busca", search: { q: query.trim() } });
      setSearchOpen(false);
    }
  };

  const handleSearchChange = (q: string) => {
    setQuery(q);
    onSearch?.(q);
  };

  return (
    <header
      className="ydo-header"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-120%)",
        transition: `opacity 0.3s var(--ease-out-expo), transform 0.3s var(--ease-out-expo)`,
      }}
    >
      {/* Logo Zang Flix */}
      <Link to="/" className="ydo-logo" aria-label="Zang Flix — início">
        <span className="ydo-logo-text">
          ZANG <strong>FLIX</strong>
        </span>
      </Link>

      {/* Navegação Compacta e Elegante */}
      <nav className="ydo-nav" aria-label="Navegação principal">
        <Link to="/" className="ydo-nav-link" activeOptions={{ exact: true }}>
          Início
        </Link>

        {/* Item Filmes com Dropdown de Categorias ao passar o mouse */}
        <div
          className="ydo-dropdown-container"
          onMouseEnter={() => {
            if (moviesTimerRef.current) clearTimeout(moviesTimerRef.current);
            setMoviesHover(true);
            setSeriesHover(false);
          }}
          onMouseLeave={() => {
            moviesTimerRef.current = setTimeout(() => setMoviesHover(false), 150);
          }}
        >
          <Link
            to="/generos/filmes"
            className={`ydo-nav-link ${moviesHover ? "is-active" : ""}`}
          >
            <span>Filmes</span>
            <ChevronDown size={13} className={`ydo-chevron ${moviesHover ? "rotate" : ""}`} />
          </Link>

          {moviesHover && (
            <div className="ydo-categories-dropdown animate-fade-in">
              <div className="ydo-dropdown-header">
                <Film size={14} style={{ color: "#e8b44a" }} />
                <span>Gêneros de Filmes</span>
              </div>
              <div className="ydo-categories-grid">
                {CATEGORIAS_FILMES.map((cat) => (
                  <Link
                    key={cat.slug}
                    to="/generos/$slug"
                    params={{ slug: cat.slug }}
                    className="ydo-category-item"
                    onClick={() => setMoviesHover(false)}
                  >
                    <span className="ydo-category-emoji">{cat.icon}</span>
                    <span className="ydo-category-name">{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Item Séries com Dropdown de Categorias ao passar o mouse */}
        <div
          className="ydo-dropdown-container"
          onMouseEnter={() => {
            if (seriesTimerRef.current) clearTimeout(seriesTimerRef.current);
            setSeriesHover(true);
            setMoviesHover(false);
          }}
          onMouseLeave={() => {
            seriesTimerRef.current = setTimeout(() => setSeriesHover(false), 150);
          }}
        >
          <Link
            to="/generos/series"
            className={`ydo-nav-link ${seriesHover ? "is-active" : ""}`}
          >
            <span>Séries</span>
            <ChevronDown size={13} className={`ydo-chevron ${seriesHover ? "rotate" : ""}`} />
          </Link>

          {seriesHover && (
            <div className="ydo-categories-dropdown animate-fade-in">
              <div className="ydo-dropdown-header">
                <Tv size={14} style={{ color: "#e8b44a" }} />
                <span>Gêneros de Séries</span>
              </div>
              <div className="ydo-categories-grid">
                {CATEGORIAS_SERIES.map((cat) => (
                  <Link
                    key={cat.slug}
                    to="/generos/$slug"
                    params={{ slug: cat.slug }}
                    className="ydo-category-item"
                    onClick={() => setSeriesHover(false)}
                  >
                    <span className="ydo-category-emoji">{cat.icon}</span>
                    <span className="ydo-category-name">{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <Link to="/lancamentos" className="ydo-nav-link">
          Lançamentos
        </Link>

        {/* Minha Lista no Menu com Badge */}
        <Link to="/minha-lista" className="ydo-nav-link ydo-nav-mylist">
          <Heart size={14} fill={savedCount > 0 ? "#e8b44a" : "none"} style={{ color: "#e8b44a" }} />
          <span>Minha Lista</span>
          {savedCount > 0 && (
            <span className="ydo-mylist-badge">{savedCount}</span>
          )}
        </Link>
      </nav>

      {/* Lado Direito: Relógio Personalizado + Busca Profissional */}
      <div className="ydo-header-tools">
        {/* Relógio Digital Personalizado */}
        {currentTime && (
          <div className="ydo-clock-pill" title="Horário Atual">
            <span className="ydo-clock-dot" />
            <span className="ydo-clock-time">{currentTime}</span>
          </div>
        )}

        {/* Sistema de Busca Personalizada */}
        {searchOpen ? (
          <form onSubmit={handleSearchSubmit} className="ydo-search-form animate-fade-in">
            <Search size={15} className="ydo-search-icon" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar no Zang Flix…"
              aria-label="Busca personalizada"
              autoComplete="off"
              className="ydo-search-input"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onSearch?.("");
                  searchRef.current?.focus();
                }}
                className="ydo-search-clear"
                aria-label="Limpar texto"
              >
                <X size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
                onSearch?.("");
              }}
              className="ydo-search-close"
              aria-label="Fechar busca"
            >
              <X size={15} />
            </button>
          </form>
        ) : (
          <button
            className="ydo-search-pill-btn"
            onClick={() => {
              setSearchOpen(true);
              setTimeout(() => searchRef.current?.focus(), 60);
            }}
            aria-label='Buscar filmes ou séries (atalho: "/")'
            title='Buscar (Atalho "/")'
          >
            <Search size={14} />
            <span className="ydo-search-pill-label">Buscar</span>
            <kbd className="ydo-search-kbd">/</kbd>
          </button>
        )}
      </div>
    </header>
  );
}
