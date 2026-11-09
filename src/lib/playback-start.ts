// src/lib/playback-start.ts — classify browser playback failures for automatic VOD recovery.
export type PlaybackFailure = "gesture" | "interrupted" | "source";

/**
 * Autoplay policy is not evidence of a bad CDN. Only actual media/source
 * errors should trigger an automatic server switch.
 */
export function playbackFailureKind(error: unknown): PlaybackFailure {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name || "") : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "gesture";
  if (name === "AbortError") return "interrupted";
  return "source";
}

/**
 * A failed startup or an entirely stalled first frame needs a better source,
 * but a browser-imposed autoplay block must retain the working Play button.
 */
export function shouldChangeServerOnStartup(
  elapsedMs: number,
  hasProgress: boolean,
  needsUserGesture: boolean,
  pausedByUser: boolean,
  maxWaitMs = 10_000,
): boolean {
  return elapsedMs >= maxWaitMs && !hasProgress && !needsUserGesture && !pausedByUser;
}
