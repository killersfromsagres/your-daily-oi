"use client";
// src/components/layout/MobileNavigation.tsx — premium bottom dock and accessible catalogue drawer.
import { useEffect, useId, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowRight, ChevronDown, Clapperboard, Compass, Film, Gamepad2,
  Heart, Home, Menu, Search, Sparkles, Tv2, Trophy, X,
} from "lucide-react";
import { mobileTabActive, isWatchRoute } from "@/lib/device-profile";

type Section = "filmes" | "series" | "animes";
type MobileNavigationProps = {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  savedCount: number;
};

const SECTIONS: { id: Section; title: string; type: "f" | "s" | "a"; items: { title:string; slug:string }[] }[] = [
  { id:"filmes", title:"Gêneros de filmes", type:"f", items:[
    {title:"Ação",slug:"acao"},{title:"Comédia",slug:"comedia"},{title:"Terror",slug:"terror"},
    {title:"Romance",slug:"romance"},{title:"Ficção científica",slug:"ficcao-cientifica"},
    {title:"Suspense",slug:"suspense"},{title:"Animação",slug:"animacao"},{title:"Documentários",slug:"documentario"},
  ] },
  { id:"series", title:"Gêneros de séries", type:"s", items:[
    {title:"Ação",slug:"acao"},{title:"Drama",slug:"drama"},{title:"Comédia",slug:"comedia"},
    {title:"Suspense",slug:"suspense"},{title:"Terror",slug:"terror"},
    {title:"Ficção científica",slug:"ficcao-cientifica"},{title:"Romance",slug:"romance"},
  ] },
  { id:"animes", title:"Gêneros de animes", type:"a", items:[
    {title:"Shounen",slug:"shounen"},{title:"Ação",slug:"acao"},
    {title:"Fantasia",slug:"fantasia"},{title:"Aventura",slug:"aventura"},
    {title:"Animação",slug:"animacao"},
  ] },
];

export function MobileNavigation({ open, onOpenChange, savedCount }: MobileNavigationProps) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const navigate = useNavigate();
  const panelId = useId();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const navigatingRef = useRef(false);
  const [expanded, setExpanded] = useState<Section | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { onOpenChange(false); }, [pathname, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    navigatingRef.current = false;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled]),input:not([disabled])"
      )].filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKeys);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeys);
      // Restoring the old focus during route transition can jump the page on mobile.
      if (!navigatingRef.current) previousFocus?.focus({preventScroll:true});
    };
  }, [open, onOpenChange]);

  const close = () => onOpenChange(false);
  const navigateAndClose = () => {
    navigatingRef.current = true;
    onOpenChange(false);
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!search.trim()) return;
    navigatingRef.current = true;
    void navigate({ to:"/busca", search:{ q:search.trim() } });
    setSearch("");
    close();
  };

  if (isWatchRoute(pathname)) return null;

  return (
    <>
      <nav className="zf-mobile-dock" aria-label="Navegação principal no celular">
        <Link to="/" className={"zf-mobile-tab" + (mobileTabActive(pathname,"home") ? " is-active" : "")}
          aria-current={mobileTabActive(pathname,"home") ? "page" : undefined}>
          <Home size={20} strokeWidth={2} /><span>Início</span>
        </Link>
        <Link to="/generos/$slug" params={{slug:"filmes"}}
          className={"zf-mobile-tab" + (mobileTabActive(pathname,"movies") ? " is-active" : "")}
          aria-current={mobileTabActive(pathname,"movies") ? "page" : undefined}>
          <Clapperboard size={20} strokeWidth={2} /><span>Filmes</span>
        </Link>
        <Link to="/tv" className={"zf-mobile-tab zf-mobile-live" + (mobileTabActive(pathname,"tv") ? " is-active" : "")}
          aria-current={mobileTabActive(pathname,"tv") ? "page" : undefined}>
          <span className="zf-mobile-live-icon"><Tv2 size={21} strokeWidth={2.1} /></span><span>TV ao vivo</span>
        </Link>
        <Link to="/futebol" className={"zf-mobile-tab" + (mobileTabActive(pathname,"games") ? " is-active" : "")}
          aria-current={mobileTabActive(pathname,"games") ? "page" : undefined}>
          <Trophy size={21} strokeWidth={2.1} /><span>Jogos</span>
        </Link>
        <button type="button" className={"zf-mobile-tab zf-mobile-menu-tab" + (open ? " is-active" : "")}
          onClick={() => onOpenChange(!open)} aria-expanded={open} aria-controls={panelId}
          aria-label={open ? "Fechar menu" : "Abrir menu completo"}>
          <Menu size={21} strokeWidth={2.1} /><span>Menu</span>
        </button>
      </nav>

      {open && (
        <div className="zf-mobile-menu-layer">
          <button type="button" className="zf-mobile-menu-scrim" onClick={close} aria-label="Fechar menu" tabIndex={-1} />
          <aside ref={panelRef} id={panelId} className="zf-mobile-menu-panel"
            role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="zf-mobile-menu-top">
              <div className="zf-mobile-menu-brand">
                <img src="/logo.png" alt="" aria-hidden="true" />
                <div><small>EXPLORE SEU UNIVERSO</small><strong id={titleId}>ZANG <span>FLIX</span></strong></div>
              </div>
              <button ref={closeRef} type="button" className="zf-mobile-menu-close" onClick={close}
                aria-label="Fechar menu de navegação"><X size={21} /></button>
            </div>
            <div className="zf-mobile-menu-scroll">
              <form className="zf-mobile-menu-search" role="search" onSubmit={submitSearch}>
                <Search size={19} aria-hidden="true" />
                <input type="search" placeholder="Qual é o seu próximo play?" value={search}
                  onChange={e => setSearch(e.target.value)} aria-label="Pesquisar no Zang Flix" />
                <button type="submit" aria-label="Pesquisar" disabled={!search.trim()}><ArrowRight size={18} /></button>
              </form>

              <Link to="/futebol" className="zf-mobile-feature" onClick={navigateAndClose}>
                <span className="zf-mobile-feature-symbol"><Trophy size={27} strokeWidth={2} /></span>
                <span><small>ESPORTES EM DESTAQUE</small><strong>Jogos do Dia</strong>
                  <em>Partidas, placares e onde assistir</em></span>
                <ArrowRight size={19} aria-hidden="true" />
              </Link>

              <p className="zf-mobile-menu-label">NAVEGAR</p>
              <div className="zf-mobile-menu-grid">
                <Link to="/" onClick={navigateAndClose}><Home size={20} /><span>Início</span></Link>
                <Link to="/generos/$slug" params={{slug:"filmes"}} onClick={navigateAndClose}><Film size={20} /><span>Filmes</span></Link>
                <Link to="/generos/$slug" params={{slug:"series"}} onClick={navigateAndClose}><Clapperboard size={20} /><span>Séries</span></Link>
                <Link to="/animes" onClick={navigateAndClose}><Sparkles size={20} /><span>Animes</span></Link>
                <Link to="/tv" onClick={navigateAndClose}><Tv2 size={20} /><span>TV ao vivo</span></Link>
                <Link to="/lancamentos" onClick={navigateAndClose}><Compass size={20} /><span>Lançamentos</span></Link>
                <Link to="/minha-lista" className="zf-mobile-mylist" onClick={close}>
                  <Heart size={20} /><span>Minha lista</span>
                  {savedCount > 0 && <b>{savedCount}</b>}
                </Link>
                <Link to="/futebol" onClick={navigateAndClose}><Gamepad2 size={20} /><span>Futebol</span></Link>
              </div>

              <p className="zf-mobile-menu-label">ENCONTRE ALGO PARA ASSISTIR</p>
              <div className="zf-mobile-menu-sections">
                {SECTIONS.map(section => (
                  <div className="zf-mobile-menu-section" key={section.id}>
                    <button type="button"
                      aria-expanded={expanded === section.id}
                      onClick={() => setExpanded(previous => previous === section.id ? null : section.id)}>
                      <span>{section.title}</span>
                      <ChevronDown size={18} className={expanded === section.id ? "is-expanded" : ""} />
                    </button>
                    {expanded === section.id && (
                      <div className="zf-mobile-menu-genres">
                        {section.items.map(item => (
                          <Link key={item.slug} to="/generos/$slug" params={{slug:item.slug}}
                            search={{tipo:section.type}} onClick={navigateAndClose}>{item.title}</Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="zf-mobile-menu-footer">Feito para descobrir. Criado para assistir.</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
