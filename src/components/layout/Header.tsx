"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

interface HeaderProps {
  onSearch?: (q: string) => void;
}

export function Header({ onSearch }: HeaderProps) {
  const [visible, setVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Auto-hide em idle (mouse parado por 3s)
  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 3000);
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
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSearch = (q: string) => {
    setQuery(q);
    onSearch?.(q);
    if (q.trim()) void navigate({ to: "/busca", search: { q } });
  };

  return (
    <header
      className="ydo-header"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-110%)",
        transition: `opacity 0.3s var(--ease-out-expo), transform 0.3s var(--ease-out-expo)`,
      }}
    >
      {/* Logo */}
      <Link to="/" className="ydo-logo" aria-label="Zang Flix — início">
        <span className="ydo-logo-text">
          ZANG <strong>FLIX</strong>
        </span>
      </Link>

      {/* Nav */}
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
      </nav>

      {/* Ferramentas */}
      <div className="ydo-header-tools">
        {searchOpen ? (
          <label className="ydo-search-field">
            <Search size={16} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar títulos…"
              aria-label="Busca global"
              autoComplete="off"
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
                onSearch?.("");
              }}
              aria-label="Fechar busca"
            >
              <X size={14} />
            </button>
          </label>
        ) : (
          <button
            className="ydo-icon-btn"
            onClick={() => {
              setSearchOpen(true);
              setTimeout(() => searchRef.current?.focus(), 60);
            }}
            aria-label='Buscar (tecle "/")'
          >
            <Search size={18} />
          </button>
        )}
      </div>
    </header>
  );
}
