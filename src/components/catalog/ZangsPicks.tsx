import type { CatalogItem } from "@/lib/types";
import { MediaCard } from "./MediaCard";

interface Props {
  items:CatalogItem[];
  savedIds:Set<string>;
  onToggleSaved:(id:string)=>void;
}

export function ZangsPicks({items,savedIds,onToggleSaved}:Props) {
  if (!items.length) return null;
  return (
    <section className="zf-zangs-picks" aria-labelledby="zangs-picks-title">
      <header className="zf-zangs-picks-heading">
        <div>
          <p className="zf-zangs-picks-eyebrow">CURADORIA ZANG FLIX</p>
          <h2 id="zangs-picks-title">Escolha do <span>Zangs</span></h2>
        </div>
        <p className="zf-zangs-picks-description">Do sobrenatural ao terror psicológico.<br/>Uma seleção para continuar a noite.</p>
      </header>
      <div className="ydo-row-track" role="region" aria-label="Filmes da Escolha do Zangs" tabIndex={0}>
        {items.map(item => <MediaCard key={item.id} item={item}
          isSaved={savedIds.has(item.id)} onToggleSaved={onToggleSaved}/>)}
      </div>
    </section>
  );
}
