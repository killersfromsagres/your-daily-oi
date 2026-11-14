"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Search, X, ChevronDown, Heart, Menu, Monitor, Trophy } from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { getSavedList } from "@/lib/storage";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { InstallAppButton } from "@/components/layout/InstallAppButton";
import { detectDeviceProfile, isWatchRoute, type DeviceProfile } from "@/lib/device-profile";
import { installTvRemoteNavigation } from "@/lib/tv-remote";
import { useLiveSuggestions } from "@/components/search/useLiveSuggestions";
import { SearchSuggestionList } from "@/components/search/SearchSuggestionList";
import type { SearchSuggestion } from "@/lib/search-suggestions";

interface HeaderProps {
  onSearch?: (q: string) => void;
}

interface CategoryItem {
  name: string;
  slug: string;
}

const CATEGORIAS_FILMES: CategoryItem[] = [
  { name: "Ação", slug: "acao" },
  { name: "Terror", slug: "terror" },
  { name: "Comédia", slug: "comedia" },
  { name: "Ficção Científica", slug: "ficcao-cientifica" },
  { name: "Suspense", slug: "suspense" },
  { name: "Romance", slug: "romance" },
  { name: "Animação", slug: "animacao" },
  { name: "Aventura", slug: "aventura" },
  { name: "Fantasia", slug: "fantasia" },
  { name: "Documentário", slug: "documentario" },
];

const CATEGORIAS_SERIES: CategoryItem[] = [
  { name: "Ação", slug: "acao" },
  { name: "Terror", slug: "terror" },
  { name: "Comédia", slug: "comedia" },
  { name: "Ficção Científica", slug: "ficcao-cientifica" },
  { name: "Suspense", slug: "suspense" },
  { name: "Romance", slug: "romance" },
  { name: "Animação", slug: "animacao" },
  { name: "Aventura", slug: "aventura" },
  { name: "Fantasia", slug: "fantasia" },
  { name: "Documentário", slug: "documentario" },
];

const CATEGORIAS_ANIMES: CategoryItem[] = [
  { name: "Shounen", slug: "shounen" },
  { name: "Ação", slug: "acao" },
  { name: "Fantasia", slug: "fantasia" },
  { name: "Animação", slug: "animacao" },
  { name: "Aventura", slug: "aventura" },
  { name: "Poderes & Ficção", slug: "ficcao-cientifica" },
];

export function Header({ onSearch }: HeaderProps) {
  const [visible, setVisible] = useState(true);
  const [mobileCollapsed, setMobileCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moviesHover, setMoviesHover] = useState(false);
  const [seriesHover, setSeriesHover] = useState(false);
  const [animesHover, setAnimesHover] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestionsId = useId();
  const { suggestions, status: suggestionStatus } = useLiveSuggestions(query, searchOpen);
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
        tvMode: (()=>{try{return localStorage.getItem("zf-tv-mode")==="true";}catch{return false;}})(),
        viewportWidth: window.innerWidth,
        coarsePointer: coarse?.matches ?? false,
        touchPoints: navigator.maxTouchPoints || 0,
      });
      setPlatform(device);
      document.documentElement.dataset["zfPlatform"] = device;
    };
    const request = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(synchronize);
    };
    synchronize();
    window.addEventListener("resize", request, { passive:true });
    window.addEventListener("orientationchange", request);
    window.addEventListener("zf-tv-mode-change",request);
    if (coarse && typeof coarse.addEventListener === "function") coarse.addEventListener("change", request);
    else coarse?.addListener?.(request);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", request);
      window.removeEventListener("orientationchange", request);
      window.removeEventListener("zf-tv-mode-change",request);
      if (coarse && typeof coarse.removeEventListener === "function") coarse.removeEventListener("change", request);
      else coarse?.removeListener?.(request);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset["zfWatch"] = isWatchRoute(pathname) ? "true" : "false";
  }, [pathname]);

  useEffect(() => {
    if (platform !== "mobile") setMobileMenuOpen(false);
  }, [platform]);

  // Keep search reachable while freeing the screen for content. Hysteresis
  // avoids flicker around the collapse point, including mobile overscroll.
  useEffect(() => {
    if (platform !== "mobile") {
      setMobileCollapsed(false);
      return;
    }
    let frame = 0;
    const synchronize = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      setMobileCollapsed(previous => previous ? y > 24 : y > 80);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(synchronize);
    };
    synchronize();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [platform, pathname]);

  // Remote D-pad focus navigation is activated only for recognizable TVs.
  useEffect(() => {
    if (platform !== "tv") return;
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
    if (platform !== "web" || (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches)) {
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
        setActiveSuggestion(-1);
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
        setSearchOpen(false);
        setActiveSuggestion(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const submitSearch = () => {
    const term = query.trim();
    if (!term) return;
    setSearchOpen(false);
    setActiveSuggestion(-1);
    void navigate({ to: "/busca", search: { q: term } });
  };

  const chooseSuggestion = (item: SearchSuggestion) => {
    setSearchOpen(false);
    setActiveSuggestion(-1);
    setQuery("");
    onSearch?.("");
    if (item.type === "f") void navigate({ to: "/filme/$id", params: { id: item.id } });
    else if (item.type === "a") void navigate({ to: "/anime/$id", params: { id: item.id } });
    else void navigate({ to: "/serie/$id", params: { id: item.id } });
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      chooseSuggestion(suggestions[activeSuggestion]);
    } else {
      submitSearch();
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setActiveSuggestion(prev => prev >= suggestions.length - 1 ? 0 : prev + 1);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setActiveSuggestion(prev => prev <= 0 ? suggestions.length - 1 : prev - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActiveSuggestion(-1);
      setSearchOpen(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setActiveSuggestion(-1);
    onSearch?.(value);
  };

  return (
    <>
    {!isWatchRoute(pathname) && (
    <header
      className={"ydo-header" + (searchOpen ? " is-searching" : "") +
        (platform === "mobile" || mobileCollapsed ? " is-mobile-collapsed" : "")}
      style={{
        opacity: visible ? 1 : 0,
        transform: platform === "mobile"
          ? (visible ? "translateY(0)" : "translateY(-120%)")
          : (visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-120%)"),
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

        {/* Submenu Filmes */}
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
                <span>Gêneros de Filmes</span>
              </div>
              <div className="ydo-categories-grid">
                {CATEGORIAS_FILMES.map((cat) => {
                  return (
                    <Link
                      key={cat.slug}
                      to="/generos/$slug"
                      params={{ slug: cat.slug }}
                      search={{ tipo: "f" }}
                      className="ydo-category-item"
                      onClick={() => setMoviesHover(false)}
                    >
                      <span className="ydo-category-name">{cat.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Submenu Séries */}
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
                <span>Gêneros de Séries</span>
              </div>
              <div className="ydo-categories-grid">
                {CATEGORIAS_SERIES.map((cat) => {
                  return (
                    <Link
                      key={cat.slug}
                      to="/generos/$slug"
                      params={{ slug: cat.slug }}
                      search={{ tipo: "s" }}
                      className="ydo-category-item"
                      onClick={() => setSeriesHover(false)}
                    >
                      <span className="ydo-category-name">{cat.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Submenu Animes */}
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
            search={{ categoria: undefined }}
            className={`ydo-nav-link ${animesHover ? "is-active" : ""}`}
          >
            <span>Animes</span>
            <ChevronDown size={13} className={`ydo-chevron ${animesHover ? "rotate" : ""}`} />
          </Link>

          {animesHover && (
            <div className="ydo-categories-dropdown animate-fade-in">
              <div className="ydo-dropdown-header">
                <span>Gêneros de Animes</span>
              </div>
              <div className="ydo-categories-grid">
                {CATEGORIAS_ANIMES.map((cat) => {
                  return (
                    <Link
                      key={cat.slug}
                      to="/animes"
                      search={{ categoria: cat.slug === "shounen" ? "sh-nen" : cat.slug }}
                      className="ydo-category-item"
                      onClick={() => setAnimesHover(false)}
                    >
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
          <span className="ydo-football-icon"><Trophy size={17} strokeWidth={2.1} /></span>
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

      <InstallAppButton />
            {/* Busca do catálogo */}
      <div className="ydo-header-tools" ref={searchContainerRef}>
        {/* Sistema de Busca Minimalista e Profissional */}
        {searchOpen ? (
          <form onSubmit={handleSearchSubmit} className="ydo-search-expand" role="search">
            <Search size={15} className="ydo-search-icon" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Filmes, séries e animes…"
              aria-label="Buscar títulos e ver sugestões"
              aria-autocomplete="list"
              aria-controls={query.trim() ? suggestionsId : undefined}
              aria-expanded={Boolean(query.trim())}
              aria-activedescendant={activeSuggestion >= 0 && suggestions[activeSuggestion] ?
                suggestionsId + "-option-" + activeSuggestion : undefined}
              autoComplete="off"
              className="ydo-search-input"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveSuggestion(-1);
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
                setActiveSuggestion(-1);
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
            type="button"
            aria-label='Buscar filmes, séries e animes (atalho: "/")'
            aria-expanded={searchOpen}
            title='Buscar (Atalho: "/")'
          >
            <Search size={16} />
          </button>
        )}
        {searchOpen && Boolean(query.trim()) && (
          <SearchSuggestionList
            id={suggestionsId}
            query={query}
            items={suggestions}
            status={suggestionStatus}
            activeIndex={activeSuggestion}
            onActiveChange={setActiveSuggestion}
            onChoose={chooseSuggestion}
            onViewAll={submitSearch}
          />
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
