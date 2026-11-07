// src/components/catalog/EpisodeIcon.tsx — premium original episodic play emblem.
export function EpisodeIcon({ size=22, className }: {size?:number; className?:string|undefined}) {
  return <svg width={size} height={size} viewBox="0 0 28 28" fill="none"
    className={className} role="img" aria-label="Episódio">
    <rect x="2.2" y="4.4" width="23.6" height="19.4" rx="5.2"
      fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="1.35"/>
    <path d="M2.5 10.1h22.8" stroke="currentColor" strokeOpacity=".65" strokeWidth="1.3"/>
    <path d="m8.2 4.8 4 5m5.3-5 3.9 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    <path d="m11.6 13 7 3.6-7 3.6V13Z" fill="currentColor" stroke="currentColor"
      strokeWidth="1.25" strokeLinejoin="round"/>
  </svg>;
}
