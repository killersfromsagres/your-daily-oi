import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Clapperboard, Film, Gamepad2, Play, Search, TvMinimal, X } from "lucide-react";
import { useLiveSuggestions } from "@/components/search/useLiveSuggestions";
import { searchSuggestionPath, type SearchSuggestion } from "@/lib/search-suggestions";
import { installTvRemoteNavigation, remoteKey } from "@/lib/tv-remote";

type TvItem = Pick<SearchSuggestion, "id" | "type" | "title" | "posterUrl">;
type TvRow = { id: string; title: string; type: "f" | "s" | "a"; items: TvItem[] };
type Section = "home" | "f" | "s" | "a";
const SECTIONS: { id: Section; title: string }[] = [
  { id: "home", title: "Início" }, { id: "f", title: "Filmes" },
  { id: "s", title: "Séries" }, { id: "a", title: "Animes" },
];
const LABEL: Record<TvItem["type"], string> = { f: "Filme", s: "Série", a: "Anime" };

export const Route = createFileRoute("/tv-home")({
  component: TvHome,
  head: () => ({ meta: [{ title: "ZANG FLIX TV — Feito para controle remoto" }] }),
});
function TvHome() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("home");
  const [rows, setRows] = useState<TvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { suggestions, status } = useLiveSuggestions(query, searchOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const firstSuggestion = useRef<HTMLButtonElement>(null);
  const initial = useRef<HTMLButtonElement>(null);
  const visibleRows = useMemo(() => section === "home" ? rows : rows.filter(row => row.type === section), [rows, section]);

  useEffect(() => {
    try { localStorage.setItem("zf-tv-mode", "true"); } catch { /* storage disabled */ }
    document.documentElement.dataset.zfPlatform = "tv";
    window.dispatchEvent(new Event("zf-tv-mode-change"));
    const dispose = installTvRemoteNavigation();
    const controller = new AbortController();
    fetch("/api/catalogo?tv=1", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json() as Promise<{ rows: TvRow[] }>;
      })
      .then(payload => { if (!controller.signal.aborted) setRows(Array.isArray(payload.rows) ? payload.rows : []); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const frame = requestAnimationFrame(() => initial.current?.focus({ preventScroll: true }));
    return () => { cancelAnimationFrame(frame); controller.abort(); dispose(); };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    // Capture Android, Tizen and webOS Back ahead of generic history navigation.
    const back = (event: globalThis.KeyboardEvent) => {
      const key = remoteKey(event);
      if ((key === "Escape" || key === "BrowserBack") && !event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation();
        setSearchOpen(false); searchTrigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", back, true);
    return () => document.removeEventListener("keydown", back, true);
  }, [searchOpen]);

  const choose = (item: TvItem) => {
    setSearchOpen(false);
    if (item.type === "f") void navigate({ to: "/filme/$id", params: { id: item.id } });
    else if (item.type === "a") void navigate({ to: "/anime/$id", params: { id: item.id } });
    else void navigate({ to: "/serie/$id", params: { id: item.id } });
  };
  const viewAll = () => {
    if (query.trim()) {
      setSearchOpen(false);
      void navigate({ to: "/busca", search: { q: query.trim() } });
    }
  };
  const searchKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    const key = remoteKey(event.nativeEvent);
    if (key === "ArrowDown") {
      event.preventDefault();
      (firstSuggestion.current ?? document.querySelector<HTMLElement>(".zf-tvh-view-all"))?.focus();
    } else if (key === "Enter") {
      event.preventDefault();
      // Enter selects the first exact suggestion; ↓ lets the user choose another.
      if (suggestions[0]) choose(suggestions[0]);
      else if (status !== "loading") viewAll();
    }
  };

  return <main className="zf-tvh" aria-label="Aplicativo ZANG FLIX para TV">
    <header className="zf-tvh-top">
      <div className="zf-tvh-brand">ZANG <span>FLIX</span><small>TV</small></div>
      <nav className="zf-tvh-nav" aria-label="Categorias do aplicativo">
        {SECTIONS.map(nav => <button key={nav.id} ref={nav.id === "home" ? initial : undefined}
          data-tv-initial-focus={nav.id === "home" ? "" : undefined}
          type="button" className={section === nav.id ? "is-current" : ""}
          aria-pressed={section === nav.id}
          onClick={() => { setSection(nav.id); setSearchOpen(false); }}>{nav.title}</button>)}
        <Link to="/tv" className="zf-tvh-navlink"><TvMinimal size={18}/> TV ao vivo</Link>
        <Link to="/futebol" className="zf-tvh-navlink">Futebol</Link>
      </nav>
      <button type="button" ref={searchTrigger} className="zf-tvh-search-trigger"
        aria-label="Abrir pesquisa" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}>
        <Search size={25}/><span>Buscar</span>
      </button>
    </header>
    {searchOpen ? <section className="zf-tvh-search" aria-label="Pesquisar catálogo">
      <div className="zf-tvh-search-head"><div><small>ENCONTRE SEU PRÓXIMO PLAY</small><h1>O que vamos assistir?</h1></div>
        <button type="button" onClick={() => { setSearchOpen(false); searchTrigger.current?.focus(); }}><X size={24}/> Fechar</button>
      </div>
      <label className="zf-tvh-search-field"><Search size={27}/>
        <input ref={inputRef} type="search" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={searchKeys} placeholder="Filmes, séries e animes…" autoComplete="off"
          aria-label="Digite o nome do título" spellCheck={false}/>
        {query && <button type="button" aria-label="Limpar" onClick={() => { setQuery(""); inputRef.current?.focus(); }}><X size={22}/></button>}
      </label>
      <p className="zf-tvh-hint"><Gamepad2 size={18}/> Use ↓ para selecionar, OK para abrir e Voltar para sair.</p>
      {query.trim() ? <>
        <h2>{status === "loading" ? "Procurando…" : "Sugestões"}</h2>
        <div className="zf-tvh-suggestions" role="listbox" aria-label="Sugestões encontradas">
          {suggestions.map((item, i) => <button key={item.type + ":" + item.id}
            ref={i === 0 ? firstSuggestion : undefined} className="zf-tvh-suggestion"
            role="option" aria-selected={false} type="button" onClick={() => choose(item)}>
            {item.posterUrl ? <img src={item.posterUrl} alt="" loading={i > 2 ? "lazy" : "eager"} decoding="async"/> :
              <span className="zf-tvh-fallback">{item.title.slice(0, 2)}</span>}
            <span className="zf-tvh-result-copy"><strong>{item.title}</strong><small>{LABEL[item.type]}{item.year ? " · " + item.year : ""}</small></span>
            <ArrowRight size={22}/></button>)}
          {status === "error" && <p role="status">Sugestões indisponíveis. Tente a busca completa.</p>}
          {status === "ready" && suggestions.length === 0 && <p role="status">Nenhum título encontrado.</p>}
        </div>
        <button type="button" className="zf-tvh-view-all" onClick={viewAll}>Ver todos os resultados <ArrowRight size={20}/></button>
      </> : <p className="zf-tvh-empty">Digite uma palavra para encontrar o título que deseja.</p>}
    </section> : <>
      <section className="zf-tvh-hero">
        <div className="zf-tvh-eyebrow">FEITO PARA SUA TELA GRANDE</div>
        <h1>Seu cinema.<br/><em>Seu controle.</em></h1>
        <p>Uma navegação descomplicada para a sala de estar. Explore pelas setas e pressione OK para assistir.</p>
        <button type="button" onClick={() => setSearchOpen(true)}><Search size={22}/> Encontrar um título <ArrowRight size={19}/></button>
        <div className="zf-tvh-hero-mark" aria-hidden="true"><Film size={80}/><b>ZANG FLIX</b><Play size={35}/></div>
      </section>
      {loading ? <p className="zf-tvh-state" role="status">Preparando seu catálogo…</p> :
        error ? <p className="zf-tvh-state" role="alert">Não foi possível carregar. <button type="button" onClick={() => location.reload()}>Tentar novamente</button></p> :
        <div className="zf-tvh-rows">
          {visibleRows.map(row => <section key={row.id} className="zf-tvh-row" aria-label={row.title}>
            <div className="zf-tvh-row-head"><h2>{row.title}</h2><span>← Explorar →</span></div>
            <div className="zf-tvh-track">{row.items.map(item => <Link key={item.type + ":" + item.id}
              to={searchSuggestionPath(item)} className="zf-tvh-poster" aria-label={"Abrir " + item.title}>
              {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" decoding="async"/> :
                <span className="zf-tvh-fallback">{item.title.slice(0,2)}</span>}
              <strong>{item.title}</strong><small>{LABEL[item.type]}</small></Link>)}</div>
          </section>)}
          {visibleRows.length === 0 && <p className="zf-tvh-state">Nenhum título disponível nesta categoria.</p>}
        </div>}
      <footer className="zf-tvh-footer">Use as setas para navegar · OK para selecionar · Voltar para retornar</footer>
    </>}
  </main>;
}
