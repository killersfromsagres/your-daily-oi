import type {SVGProps} from "react";

/** Distinct, restrained manga-panel mark for the dedicated TV navigation.
 * Lightweight SVG; no bitmap, star/sparkle or AI-generated ornament. */
export function TvAnimeFrameIcon({size=22,...props}:SVGProps<SVGSVGElement>&{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" {...props}>
    <rect x="2.6" y="3.1" width="18.8" height="17.8" rx="2.5"/>
    <path d="M2.8 10.2h18.4M10.2 3.2v17.5"/>
    <path d="m13.2 12.8 4.9 2.6-4.9 2.5z" fill="currentColor" stroke="none"/>
    <path d="m5.1 14.5 2.7-1.7M5.1 17.9l2.7-1.7"/>
  </svg>;
}
