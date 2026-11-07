// src/lib/hero-images.ts — memory-safe TMDB image resolution selection.
export type HeroImageWidth = "w780" | "w1280" | "original";

/**
 * Use the correct CDN rendition instead of /original (often several megabytes).
 * Only rewrite standard TMDB paths; preserve other providers' URLs as supplied.
 */
export function getSizedHeroImage(
  backdropUrl: string | null | undefined,
  posterUrl: string | null | undefined,
  width: HeroImageWidth,
): string {
  const source = backdropUrl || posterUrl || "";
  if (!source) return "";
  try {
    const url = new URL(source);
    if (url.hostname !== "image.tmdb.org" || !url.pathname.startsWith("/t/p/")) return source;
    url.pathname = url.pathname.replace(/^\/t\/p\/(?:original|w\d+)\//, "/t/p/" + width + "/");
    return url.toString();
  } catch {
    return source;
  }
}
