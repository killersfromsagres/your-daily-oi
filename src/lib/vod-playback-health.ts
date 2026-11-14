// Compare known feature-length metadata against delivered media duration.
// A five-minute preview is not a substitute for a full-length movie.
// Shorts, anime, series and unknown runtimes are never blocked by this check.
export function looksLikeTruncatedFeature(
  contentType: "movie" | "series" | "anime",
  durationSeconds: number,
  expectedRuntimeMinutes?: number,
): boolean {
  if (contentType !== "movie" || !expectedRuntimeMinutes || expectedRuntimeMinutes < 60 ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  const maxShortClipSeconds = Math.min(12 * 60, expectedRuntimeMinutes * 60 * 0.13);
  return durationSeconds < maxShortClipSeconds;
}
