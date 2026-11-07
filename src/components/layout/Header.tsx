"use client";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Search, X, ChevronDown, Heart, Film, Tv, Sparkles, Flame, Ghost, Menu, Monitor,
  Clapperboard, Laugh, Rocket, Compass, WandSparkles, BookOpenCheck,
  Swords, BrainCircuit, ScanEye, HandHeart, Layers3, Drama,
} from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { getSavedList } from "@/lib/storage";
import { FootballIcon } from "@/components/sports/FootballIcon";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { detectDeviceProfile, isWatchRoute, type DeviceProfile } from "@/lib/device-profile";
import { installTvRemoteNavigation } from "@/lib/tv-remote";

interface HeaderProps {
  onSearch?: (q: string) => void;
}

interface CategoryItem {
  name: string;
  slug: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;
}

const CATEGORIAS_FILMES: CategoryItem[] = [
  { name: "Ação", slug: "acao", Icon: Flame },
  { name: "Terror", slug: "terror", Icon: Ghost },
  { name: "Comédia", slug: "comedia", Icon: Laugh },
  { name: "Ficção Científica", slug: "ficcao-cientifica", Icon: BrainCircuit },
  { name: "Suspense", slug: "suspense", Icon: ScanEye },
  { name: "Romance", slug: "romance", Icon: HandHeart },
  { name: "Animação", slug: "animacao", Icon: Layers3 },
  { name: "Aventura", slug: "aventura", Icon: Compass },
  { name: "Fantasia", slug: "fantasia", Icon: WandSparkles },
  { name: "Documentário", slug: "documentario", Icon: BookOpenCheck },
];

const CATEGORIAS_SERIES: CategoryItem[] = [
  { name: "Ação", slug: "acao", Icon: Flame },
  { name: "Terror", slug: "terror", Icon: Ghost },
  { name: "Comédia", slug: "comedia", Icon: Laugh },
  { name: "Ficção Científica", slug: "ficcao-cientifica", Icon: BrainCircuit },
  { name: "Suspense", slug: "suspense", Icon: ScanEye },
  { name: "Romance", slug: "romance", Icon: HandHeart },
  { name: "Animação", slug: "animacao", Icon: Layers3 },
  { name: "Aventura", slug: "aventura", Icon: Compass },
  { name: "Fantasia", slug: "fantasia", Icon: WandSparkles },
  { name: "Documentário", slug: "documentario", Icon: BookOpenCheck },
];

const CATEGORIAS_ANIMES: CategoryItem[] = [
  { name: "Shounen", slug: "shounen", Icon: Swords },
  { name: "Ação", slug: "acao", Icon: Flame },
  { name: "Fantasia", slug: "fantasia", Icon: WandSparkles },
  { name: "Animação", slug: "animacao", Icon: Sparkles },
  { name: "Aventura", slug: "aventura", Icon: Compass },
  { name: "Poderes & Ficção", slug: "ficcao-cientifica", Icon: BrainCircuit },
];

export function Header({ onSearch }: HeaderProps) {
  const [visible, setVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moviesHover, setMoviesHover] = useState(false);
  const [seriesHover, setSeriesHover] = useState(false);
  const [animesHover, setAnimesHover] = useState(false);
  const [query, setQuery] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [platform, setPlatform] = useState<DeviceProfile>("web");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = useRouterState({ select: state => state.location.pathname });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const moviesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Viewport and input capabilities control the experience, with Smart TV user
  // agents taking precedence. SSR layout remains mobile-safe via media queries.
  useEffect(() => {
    const coarse = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    let animationFrame = 0;
    const synchronize = () => {
      const device = detectDeviceProfile({
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        coarsePointer: coarse?.matches ?? false,
        touchPoints: navigator.maxTouchPoints || 0,
      });
      setPlatform(device);
      document.documentElement.dataset.zfPlatform = device;
    };
    const request = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(synchronize);
    };
    synchronize();
    window.addEventListener("resize", request, { passive:true });
    window.addEventListener("orientationchange", request);
    if (coarse && typeof coarse.addEventListener === "function") coarse.addEventListener("change", request);
    else coarse?.addListener?.(request);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", request);
      window.removeEventListener("orientationchange", request);
      if (coarse && typeof coarse.removeEventListener === "function") coarse.removeEventListener("change", request);
      else coarse?.removeListener?.(request);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.zfWatch = isWatchRoute(pathname) ? "true" : "false";
  }, [pathname]);

  useEffect(() => {
    if (platform !== "mobile") setMobileMenuOpen(false);
  }, [platform]);

  // Remote D-pad focus navigation is activated only for recognizable TVs.
  useEffect(() => {
    if (platform !== "tv" || isWatchRoute(pathname)) return;
    return installTvRemoteNavigation();
  }, [platform, pathname]);

  // Monitora contagem de itens na Minha Lista
  useEffect(() => {
    const checkSaved = () => {
      setSavedCount(getSavedList().length);
    };
    checkSaved();
    const interval = setInterval(checkSaved, 2000);
    return () => clearInterval(interval);
  }, []);

  // Autohide is desktop-only. Touch interfaces and D-pad remotes need persistent navigation.
  useEffect(() => {
    if (platform !== "web" || window.matchMedia("(pointer: coarse)").matches) {
      setVisible(true);
      return;
    }
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
  }, [searchOpen, moviesHover, seriesHover, animesHover, platform]);

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
    <>
    {!isWatchRoute(pathname) && (
    <header
      className={"ydo-header" + (searchOpen ? " is-searching" : "")}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-120%)",
        transition: `opacity 0.3s var(--ease-out-expo), transform 0.3s var(--ease-out-expo)`,
      }}
    >
      {/* Logo Zang Flix */}
      <Link to="/" className="ydo-logo" aria-label="Zang Flix — início">
        <img
          src="/logo.png"
          alt="Zang Flix Logo"
          className="ydo-logo-img"
        />
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
          onFocus={() => {
            setMoviesHover(true); setSeriesHover(false); setAnimesHover(false);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMoviesHover(false);
          }}
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
            to="/generos/$slug"
            params={{slug:"filmes"}}
            className={`ydo-nav-link ${moviesHover ? "is-active" : ""}`}
          >
            <span>Filmes</span>
            <ChevronDown size={13} className={`ydo-chevron ${moviesHover ? "rotate" : ""}`} />
          </Link>

          {moviesHover && (
            <div className="ydo-categories-dropdown animate-fade-in">
              <div className="ydo-dropdown-header">
                <Clapperboard size={16} style={{ color: "#f3c786" }} />
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
                      search={{ tipo: "f" }}
                      className="ydo-category-item"
                      onClick={() => setMoviesHover(false)}
                    >
                      <span className="ydo-genre-icon-shell"><Icon size={17} strokeWidth={2.1} className="ydo-category-icon" /></span>
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
          onFocus={() => {
            setMoviesHover(false); setSeriesHover(true); setAnimesHover(false);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSeriesHover(false);
          }}
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
            to="/generos/$slug"
            params={{slug:"series"}}
            className={`ydo-nav-link ${seriesHover ? "is-active" : ""}`}
          >
            <span>Séries</span>
            <ChevronDown size={13} className={`ydo-chevron ${seriesHover ? "rotate" : ""}`} />
          </Link>

          {seriesHover && (
            <div className="ydo-categories-dropdown animate-fade-in">
              <div className="ydo-dropdown-header">
                <Drama size={16} style={{ color: "#f3c786" }} />
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
                      search={{ tipo: "s" }}
                      className="ydo-category-item"
                      onClick={() => setSeriesHover(false)}
                    >
                      <span className="ydo-genre-icon-shell"><Icon size={17} strokeWidth={2.1} className="ydo-category-icon" /></span>
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
          onFocus={() => {
            setMoviesHover(false); setSeriesHover(false); setAnimesHover(true);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAnimesHover(false);
          }}
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
                <WandSparkles size={16} style={{ color: "#f3c786" }} />
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
                      search={{ tipo: "a" }}
                      className="ydo-category-item"
                      onClick={() => setAnimesHover(false)}
                    >
                      <span className="ydo-genre-icon-shell"><Icon size={17} strokeWidth={2.1} className="ydo-category-icon" /></span>
                      <span className="ydo-category-name">{cat.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* TV Ao Vivo */}
        <Link to="/tv" className="ydo-nav-link ydo-nav-tv">
          <span className="ydo-live-dot" />
          <span>TV Ao Vivo</span>
        </Link>

        <Link to="/futebol" className="ydo-nav-link ydo-nav-football"
          title="Jogos, placares e onde assistir" aria-label="Jogos do Dia — jogos, placares e canais">
          <span className="ydo-football-icon"><FootballIcon size={18} /></span>
          <span>Jogos do Dia</span>
          <span className="ydo-football-today">HOJE</span>
        </Link>

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

      {/* Busca do catálogo */}
      <div className="ydo-header-tools" ref={searchContainerRef}>
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
      <button type="button" className="ydo-mobile-menu-trigger"
        aria-expanded={mobileMenuOpen} aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        onClick={() => setMobileMenuOpen(value => !value)}>
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        <span>Menu</span>
      </button>
      <span className="ydo-tv-remote-indicator" aria-hidden="true">
        <Monitor size={17} /> MODO TV
      </span>
    </header>
    )}
    {!isWatchRoute(pathname) && (
      <MobileNavigation open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} savedCount={savedCount} />
    )}
    </>
  );
}
