import { MediaCard } from "./MediaCard";
import type { CatalogItem } from "@/lib/types";

interface MediaRowProps {
  title: string;
  eyebrow?: string;
  items: CatalogItem[];
  savedIds?: Set<string>;
  onToggleSaved?: (id: string) => void;
  ranked?: boolean;
}

export function MediaRow({
  title,
  eyebrow,
  items,
  savedIds = new Set(),
  onToggleSaved,
  ranked = false,
}: MediaRowProps) {
  if (!items.length) return null;
  return (
    <section className="ydo-row-section">
      <div className="ydo-row-header">
        <div>
          {eyebrow && <span className="ydo-row-eyebrow">{eyebrow}</span>}
          <h2 className="ydo-row-title">{title}</h2>
        </div>
      </div>
      <div className="ydo-row-track">
        {items.map((item, i) => (
          <MediaCard
            key={item.id}
            item={item}
            isSaved={savedIds.has(item.id)}
            onToggleSaved={onToggleSaved}
            rank={ranked ? i + 1 : undefined}
          />
        ))}
      </div>
    </section>
  );
}
