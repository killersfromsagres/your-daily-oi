/** Neutral, brand-independent stadium pictogram used for the venue panel. */
export function StadiumIcon({ size=24 }: {size?:number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="16" cy="10.5" rx="12.5" ry="5.5" stroke="currentColor" strokeWidth="1.65"/>
      <ellipse cx="16" cy="10.5" rx="8" ry="2.6" stroke="currentColor" strokeWidth="1.2" opacity=".65"/>
      <path d="M3.5 10.5v10.1c0 3.4 5.6 6.1 12.5 6.1s12.5-2.7 12.5-6.1V10.5" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round"/>
      <path d="M7.5 14.2v9.3m5-7.4v10m7-10v10m5-12v9.4M16 5V2m-7 4.6L7.5 3.5m16.9 3.1L26 3.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity=".78"/>
      <path d="M5 20.5c5.9 4.2 16.1 4.2 22 0" stroke="currentColor" strokeWidth="1.2" opacity=".55"/>
    </svg>
  );
}
