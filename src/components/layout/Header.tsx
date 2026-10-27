"use client";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Search,
  X,
  ChevronDown,
  Heart,
  Film,
  Tv,
  Sparkles,
  Flame,
  Ghost,
  Smile,
  Rocket,
  Compass,
  Wand2,
  Video,
  Theater,
  ShieldAlert,
  Swords,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { getSavedList } from "@/lib/storage";

interface HeaderProps {
  onSearch?: (q: string) => void;
}

interface CategoryItem {
  name: string;
  slug: string;
  Icon: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
}

const CATEGORIAS_FILMES: CategoryItem[] = [
  { name: "Ação", slug: "acao", Icon: Flame },
  { name: "Terror", slug: "terror", Icon: Ghost },
  { name: "Comédia", slug: "comedia", Icon: Smile },
  { name: "Ficção Científica", slug: "ficcao-cientifica", Icon: Rocket },
  { name: "Suspense", slug: "suspense", Icon: Search },
  { name: "Romance", slug: "romance", Icon: Heart },
  { name: "Animação", slug: "animacao", Icon: Sparkles },
  { name: "Aventura", slug: "aventura", Icon: Compass },
  { name: "Fantasia", slug: "fantasia", Icon: Wand2 },
  { name: "Documentário", slug: "documentario", Icon: Video },
];

const CATEGORIAS_SERIES: CategoryItem[] = [
  { name: "Drama", slug: "drama", Icon: Theater },
  { name: "Suspense", slug: "suspense", Icon: Search },
  { name: "Ficção Científica", slug: "ficcao-cientifica", Icon: Rocket },
  { name: "Ação & Aventura", slug: "acao", Icon: Flame },
  { name: "Comédia", slug: "comedia", Icon: Smile },
  { name: "Crime & Mistério", slug: "crime", Icon: ShieldAlert },
  { name: "Animação", slug: "animacao", Icon: Sparkles },
  { name: "Documentário", slug: "documentario", Icon: Video },
];

const CATEGORIAS_ANIMES: CategoryItem[] = [
  { name: "Shounen", slug: "shounen", Icon: Swords },
  { name: "Ação", slug: "acao", Icon: Flame },
  { name: "Fantasia", slug: "fantasia", Icon: Wand2 },
  { name: "Animação", slug: "animacao", Icon: Sparkles },
  { name: "Aventura", slug: "aventura", Icon: Compass },
  { name: "Poderes & Ficção", slug: "ficcao-cientifica", Icon: Zap },
];

export function Header({ onSearch }: HeaderProps) {
  const [visible, setVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moviesHover, setMoviesHover] = useState(false);
  const [seriesHover, setSeriesHover] = useState(false);
  const [animesHover, setAnimesHover] = useState(false);
  const [query, setQuery] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const moviesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Relógio digital personalizado
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
        if (!searchOpen && !moviesHover && !seriesHover && !animesHover) {
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
  }, [searchOpen, moviesHover, seriesHover, animesHover]);

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
        setTimeout(() => searchRef.current?.focus(), 80);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMoviesHover(false);
        setSeriesHover(false);
        setAnimesHover(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Fecha busca ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        if (searchOpen && !query) {
          setSearchOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen, query]);

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
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-120%)",
        transition: `opacity 0.3s var(--ease-out-expo), transform 0.3s var(--ease-out-expo)`,
      }}
    >
      {/* Logo Zang Flix */}
      <Link to="/" className="ydo-logo" aria-label="Zang Flix — início">
        <span className="ydo-logo-text">
          ZANG <strong>FLIX</strong>
        </span>
      </Link>

      {/* Navegação Compacta e Proporcional */}
      <nav className="ydo-nav" aria-label="Navegação principal">
        <Link to="/" className="ydo-nav-link" activeOptions={{ exact: true }}>
          Início
        </Link>

        {/* Hover Filmes com Ícones Minimalistas */}
        <div
          className="ydo-dropdown-container"
          onMouseEnter={() => {
            if (moviesTimerRef.current) clearTimeout(moviesTimerRef.current);
            setMoviesHover(true);
            setSeriesHover(false);
            setAnimesHover(false);
          }}
          onMouseLeave={() => {
            moviesTimerRef.current = setTimeout(() => setMoviesHover(false), 160);
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
                {CATEGORIAS_FILMES.map((cat) => {
                  const Icon = cat.Icon;
                  return (
                    <Link
                      key={cat.slug}
                      to="/generos/$slug"
                      params={{ slug: cat.slug }}
                      className="ydo-category-item"
                      onClick={() => setMoviesHover(false)}
                    >
                      <Icon size={14} className="ydo-category-icon" />
                      <span className="ydo-category-name">{cat.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Hover Séries com Ícones Minimalistas */}
        <div
          className="ydo-dropdown-container"
          onMouseEnter={() => {
            if (seriesTimerRef.current) clearTimeout(seriesTimerRef.current);
            setSeriesHover(true);
            setMoviesHover(false);
            setAnimesHover(false);
          }}
          onMouseLeave={() => {
            seriesTimerRef.current = setTimeout(() => setSeriesHover(false), 160);
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
                {CATEGORIAS_SERIES.map((cat) => {
                  const Icon = cat.Icon;
                  return (
                    <Link
                      key={cat.slug}
                      to="/generos/$slug"
                      params={{ slug: cat.slug }}
                      className="ydo-category-item"
                      onClick={() => setSeriesHover(false)}
                    >
                      <Icon size={14} className="ydo-category-icon" />
                      <span className="ydo-category-name">{cat.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Hover Animes com Ícones Minimalistas */}
        <div
          className="ydo-dropdown-container"
          onMouseEnter={() => {
            if (animesTimerRef.current) clearTimeout(animesTimerRef.current);
            setAnimesHover(true);
            setMoviesHover(false);
            setSeriesHover(false);
          }}
          onMouseLeave={() => {
            animesTimerRef.current = setTimeout(() => setAnimesHover(false), 160);
          }}
        >
          <Link
            to="/animes"
            className={`ydo-nav-link ${animesHover ? "is-active" : ""}`}
          >
            <span>Animes</span>
            <ChevronDown size={13} className={`ydo-chevron ${animesHover ? "rotate" : ""}`} />
          </Link>

          {animesHover && (
            <div className="ydo-categories-dropdown animate-fade-in">
              <div className="ydo-dropdown-header">
                <Sparkles size={14} style={{ color: "#e8b44a" }} />
                <span>Gêneros de Animes</span>
              </div>
              <div className="ydo-categories-grid">
                {CATEGORIAS_ANIMES.map((cat) => {
                  const Icon = cat.Icon;
                  return (
                    <Link
                      key={cat.slug}
                      to="/generos/$slug"
                      params={{ slug: cat.slug }}
                      className="ydo-category-item"
                      onClick={() => setAnimesHover(false)}
                    >
                      <Icon size={14} className="ydo-category-icon" />
                      <span className="ydo-category-name">{cat.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Link to="/lancamentos" className="ydo-nav-link">
          Lançamentos
        </Link>

        {/* Minha Lista */}
        <Link to="/minha-lista" className="ydo-nav-link ydo-nav-mylist">
          <Heart size={14} fill={savedCount > 0 ? "#e8b44a" : "none"} style={{ color: "#e8b44a" }} />
          <span>Minha Lista</span>
          {savedCount > 0 && (
            <span className="ydo-mylist-badge">{savedCount}</span>
          )}
        </Link>
      </nav>

      {/* Lado Direito: Relógio + Ícone de Pesquisa Profissional */}
      <div className="ydo-header-tools" ref={searchContainerRef}>
        {/* Relógio Digital Personalizado */}
        {currentTime && !searchOpen && (
          <div className="ydo-clock-pill" title="Horário Atual">
            <span className="ydo-clock-dot" />
            <span className="ydo-clock-time">{currentTime}</span>
          </div>
        )}

        {/* Sistema de Busca Minimalista e Profissional */}
        {searchOpen ? (
          <form onSubmit={handleSearchSubmit} className="ydo-search-expand animate-scale-in">
            <Search size={15} className="ydo-search-icon" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar filmes, séries, animes…"
              aria-label="Buscar títulos"
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
            className="ydo-search-trigger-btn"
            onClick={() => {
              setSearchOpen(true);
              setTimeout(() => searchRef.current?.focus(), 80);
            }}
            aria-label='Buscar filmes ou séries (atalho: "/")'
            title='Buscar (Atalho: "/")'
          >
            <Search size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
