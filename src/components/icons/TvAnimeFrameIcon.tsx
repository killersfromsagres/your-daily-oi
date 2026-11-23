import type {SVGProps} from "react";

/** Original TV-only manga/animation-cel navigation pictogram.
 * Professional 24px stroke grid with overlapping hand-drawn frames,
 * editorial panel divisions and a clear play marker. No star or sparkle.
 * Pure SVG: zero additional bitmaps, fonts, animations or heavy filters.
 */
export function TvAnimeFrameIcon({size=22,...props}:SVGProps<SVGSVGElement>&{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    focusable="false" {...props}>
    <path d="M7.5 3.5h11A2.5 2.5 0 0 1 21 6v11.2"/>
    <rect x="3" y="6" width="16.2" height="15" rx="2.4"/>
    <path d="M3.3 11.1h15.5M10.9 11.1v9.5"/>
    <path d="m5.6 14.6 2.8-1.7M5.6 17.7l2.8-1.7"/>
    <path d="m13.3 13.6 3.5 2.25-3.5 2.25z" fill="currentColor" stroke="none"/>
  </svg>;
}
