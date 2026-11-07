// src/lib/fullscreen-orientation.ts — detect mobile fullscreen layout and safely request landscape.
export type OrientationLock = {
  lock?: (mode: "landscape") => Promise<void>;
  unlock?: () => void;
};

export function isMobileLandscapeTarget(input: {
  userAgent: string;
  viewportWidth: number;
  coarsePointer: boolean;
}): boolean {
  if (/(?:iPhone|iPod|Android.*Mobile|Mobile.*Android)/i.test(input.userAgent)) return true;
  return input.coarsePointer && input.viewportWidth <= 1100;
}

export function shouldRotateFullscreenFallback(input: {
  mobile: boolean;
  portrait: boolean;
  orientationLocked: boolean;
}): boolean {
  return input.mobile && input.portrait && !input.orientationLocked;
}

// The Screen Orientation API is only granted on certain mobile browsers, often
// after fullscreen begins. Not supported on iOS Safari's HTML inline fullscreen.
export async function tryLockLandscape(orientation: OrientationLock | null | undefined): Promise<boolean> {
  if (typeof orientation?.lock !== "function") return false;
  try {
    await orientation.lock("landscape");
    return true;
  } catch {
    return false;
  }
}

export function unlockLandscape(orientation: OrientationLock | null | undefined): void {
  try { orientation?.unlock?.(); } catch { /* Browser may have released it already. */ }
}
