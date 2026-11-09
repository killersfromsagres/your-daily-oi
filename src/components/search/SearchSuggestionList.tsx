// src/components/search/SearchSuggestionList.tsx — shared accessible result panel for header and mobile drawer.
import { ArrowRight, Clapperboard, Film, LoaderCircle, Search, Sparkles } from "lucide-react";
import type { SearchSuggestion } from "@/lib/search-suggestions";
import type { SuggestionStatus } from "./useLiveSuggestions";

type Props = {
  id: string;
  query: string;
  items: SearchSuggestion[];
  status: SuggestionStatus;
  activeIndex: number;
  onChoose: (item: SearchSuggestion) => void;
  onActiveChange: (index: number) => void;
  onViewAll: () => void;
};

const labels: Record<SearchSuggestion["type"], string> = {
  f: "Filme", s: "Série", a: "Anime",
};
const symbols = {
  f: Film, s: Clapperboard, a: Sparkles,
} as const;

export function SearchSuggestionList({
  id, query, items, status, activeIndex, onChoose, onActiveChange, onViewAll,
}: Props) {
  if (!query.trim()) return null;
  return (
    <div className="zf-search-suggestions" id={id} role="listbox"
      aria-label="Sugestões de filmes, séries e animes">
      <div className="zf-search-suggestions-top">
        <span><Search size={12} aria-hidden="true" /> SUGESTÕES ENQUANTO DIGITA</span>
        {status === "ready" && <small>{items.length} resultados</small>}
      </div>
      {status === "loading" ? (
        <div className="zf-search-feedback" role="status">
          <LoaderCircle className="zf-search-spinner" size={17} aria-hidden="true" />
          Procurando títulos…
        </div>
      ) : status === "error" ? (
        <div className="zf-search-feedback" role="status">
          Não foi possível atualizar as sugestões. Pressione Enter para abrir a busca.
        </div>
      ) : items.length === 0 ? (
        <div className="zf-search-feedback" role="status">
          Nenhum título encontrado. Experimente outra palavra.
        </div>
      ) : (
        <div className="zf-search-result-list">
          {items.map((item, index) => {
            const Icon = symbols[item.type];
            return (
              <button key={item.type + ":" + item.id} id={id + "-option-" + index}
                type="button" role="option" aria-selected={activeIndex === index}
                className={"zf-search-result" + (activeIndex === index ? " is-active" : "")}
                onMouseEnter={() => onActiveChange(index)}
                onClick={() => onChoose(item)}>
                <span className="zf-search-poster">
                  {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" decoding="async" /> :
                    <Icon size={23} aria-hidden="true" />}
                </span>
                <span className="zf-search-result-meta">
                  <strong>{item.title}</strong>
                  <small>{labels[item.type]}{item.year ? " · " + item.year : ""}</small>
                </span>
                <ArrowRight size={15} className="zf-search-result-arrow" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      <button className="zf-search-view-all" type="button" onClick={onViewAll}>
        Ver todos os resultados para “{query.trim()}”
        <ArrowRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
