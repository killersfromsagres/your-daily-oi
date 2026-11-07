// src/components/sports/FootballIcon.tsx — original scalable football and competition pictograms.
export function FootballIcon({ size=20, className }: {size?:number; className?:string | undefined}) {
  return <svg width={size} height={size} className={className} viewBox="0 0 32 32"
    role="img" aria-label="Bola de futebol" fill="none">
    <circle cx="16" cy="16" r="13.7" fill="currentColor" fillOpacity=".10" stroke="currentColor" strokeWidth="1.65"/>
    <path d="m16 9.5 6 4.2-2.3 7.1h-7.4L10 13.7 16 9.5Z"
      fill="currentColor" fillOpacity=".64" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="m16 9.5.1-6.8M10 13.7 3.5 11.8m8.8 9-3.9 5.4m11.3-5.4 3.8 5.4m-1.5-12.5 6.5-1.9"
      stroke="currentColor" strokeWidth="1.55" strokeLinecap="round"/>
    <path d="m11.7 27 4.3 2 4.3-2M2.9 17.5l4.5 4.4M29.1 17.5l-4.5 4.4"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".66"/>
  </svg>;
}
export function CompetitionIcon({ size=20, className }: {size?:number; className?:string | undefined}) {
  return <svg width={size} height={size} className={className} viewBox="0 0 32 32"
    role="img" aria-label="Emblema de competição" fill="none">
    <path d="M16 2.5 28 8v8.2c0 7.4-4.7 11-12 13.3C8.7 27.2 4 23.6 4 16.2V8L16 2.5Z"
      stroke="currentColor" fill="currentColor" fillOpacity=".08" strokeWidth="1.7"/>
    <path d="m16 8 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L16 8Z"
      fill="currentColor" stroke="currentColor" strokeWidth=".4"/>
  </svg>;
}
