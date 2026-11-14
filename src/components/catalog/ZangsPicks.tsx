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
        <h2 id="zangs-picks-title" className="zf-horror-title">Mais <span>terror</span> na sua noite</h2>
      </header>
      <div className="ydo-row-track" role="region" aria-label="Mais terror na sua noite" tabIndex={0}>
        {items.map(item => <MediaCard key={item.id} item={item}
          isSaved={savedIds.has(item.id)} onToggleSaved={onToggleSaved}/>)}
      </div>
    </section>
  );
}
