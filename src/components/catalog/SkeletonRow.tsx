export function SkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <section
      className="ydo-row-section"
      aria-busy="true"
      aria-label="Carregando..."
    >
      <div className="ydo-row-header">
        <div>
          <div className="skeleton ydo-skeleton-text" style={{ width: 80 }} />
          <div
            className="skeleton ydo-skeleton-text"
            style={{ width: 180, marginTop: 8, height: 16 }}
          />
        </div>
      </div>
      <div className="ydo-row-track">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="ydo-skeleton-card">
            <div className="skeleton ydo-skeleton-poster" />
            <div className="skeleton ydo-skeleton-text" />
            <div className="skeleton ydo-skeleton-text-sm" />
          </div>
        ))}
      </div>
    </section>
  );
}
