"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X, ChevronDown, Sparkles, Film, Tv, Flame, Compass } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

interface HeaderProps {
  onSearch?: (q: string) => void;
}

const CATEGORIAS = [
  { name: "Ação", slug: "acao", icon: "💥" },
  { name: "Terror", slug: "terror", icon: "👻" },
  { name: "Comédia", slug: "comedia", icon: "😂" },
  { name: "Ficção Científica", slug: "ficcao-cientifica", icon: "🚀" },
  { name: "Suspense", slug: "suspense", icon: "🔍" },
  { name: "Drama", slug: "drama", icon: "🎭" },
  { name: "Romance", slug: "romance", icon: "❤️" },
  { name: "Animação", slug: "animacao", icon: "✨" },
  { name: "Aventura", slug: "aventura", icon: "🗺️" },
  { name: "Fantasia", slug: "fantasia", icon: "🧙" },
  { name: "Documentário", slug: "documentario", icon: "📹" },
  { name: "Crime", slug: "crime", icon: "🕵️" },
];

export function Header({ onSearch }: HeaderProps) {
  const [visible, setVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Auto-hide em idle (mouse parado por 4s)
  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Não esconde se a busca ou dropdown de categorias estiver aberto
        if (!searchOpen && !categoriesOpen) {
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
  }, [searchOpen, categoriesOpen]);

  // Fecha dropdown de categorias ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCategoriesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Atalho "/" para focar busca
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
        setCategoriesOpen(false);
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
      {/* Logo Exclusivo Zang Flix */}
      <Link to="/" className="ydo-logo" aria-label="Zang Flix — início">
        <span className="ydo-logo-text">
          ZANG <strong>FLIX</strong>
        </span>
      </Link>

      {/* Navegação Principal */}
      <nav className="ydo-nav" aria-label="Navegação principal">
        <Link to="/" className="ydo-nav-link" activeOptions={{ exact: true }}>
          Início
        </Link>
        <Link to="/generos/filmes" className="ydo-nav-link">
          Filmes
        </Link>
        <Link to="/generos/series" className="ydo-nav-link">
          Séries
        </Link>
        <Link to="/lancamentos" className="ydo-nav-link">
          Lançamentos
        </Link>

        {/* Submenu Dropdown de Categorias */}
        <div
          ref={dropdownRef}
          className="ydo-dropdown-container"
          onMouseEnter={() => setCategoriesOpen(true)}
          onMouseLeave={() => setCategoriesOpen(false)}
        >
          <button
            type="button"
            className={`ydo-nav-link ydo-dropdown-trigger ${categoriesOpen ? "is-active" : ""}`}
            onClick={() => setCategoriesOpen(!categoriesOpen)}
            aria-expanded={categoriesOpen}
          >
            <span>Categorias</span>
            <ChevronDown size={14} className={`ydo-chevron ${categoriesOpen ? "rotate" : ""}`} />
          </button>

          {categoriesOpen && (
            <div className="ydo-categories-dropdown animate-fade-in">
              <div className="ydo-dropdown-header">
                <Compass size={14} style={{ color: "#e8b44a" }} />
                <span>Explorar por Gênero</span>
              </div>
              <div className="ydo-categories-grid">
                {CATEGORIAS.map((cat) => (
                  <Link
                    key={cat.slug}
                    to="/generos/$slug"
                    params={{ slug: cat.slug }}
                    className="ydo-category-item"
                    onClick={() => setCategoriesOpen(false)}
                  >
                    <span className="ydo-category-emoji">{cat.icon}</span>
                    <span className="ydo-category-name">{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Campo de Busca Personalizado e Profissional */}
      <div className="ydo-header-tools">
        {searchOpen ? (
          <form onSubmit={handleSearchSubmit} className="ydo-search-form animate-fade-in">
            <Search size={16} className="ydo-search-icon" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar filmes, séries..."
              aria-label="Busca profissional"
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
              <X size={16} />
            </button>
          </form>
        ) : (
          <button
            className="ydo-search-pill-btn"
            onClick={() => {
              setSearchOpen(true);
              setTimeout(() => searchRef.current?.focus(), 60);
            }}
            aria-label='Buscar títulos (pressione "/")'
            title='Buscar (Atalho: "/")'
          >
            <Search size={15} />
            <span className="ydo-search-pill-label">Buscar...</span>
            <kbd className="ydo-search-kbd">/</kbd>
          </button>
        )}
      </div>
    </header>
  );
}
