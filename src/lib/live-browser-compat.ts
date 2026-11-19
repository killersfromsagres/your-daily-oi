/**
 * Brave media compatibility. Never disable Shields or alter the user's privacy
 * settings. Use the site's existing authorized, same-origin media route first.
 * The original HTTPS media URL remains a fallback if the backend is blocked.
 */
import { initialLiveMode, type LiveAccessMode, type LiveSourceLike } from "./live-source";

type BraveNavigator = Navigator & { brave?: { isBrave?: () => Promise<boolean> } };

export async function isBraveBrowser(navigatorObject?: Navigator): Promise<boolean> {
  if (!navigatorObject) return false;
  try {
    const check = (navigatorObject as BraveNavigator).brave?.isBrave;
    return typeof check === "function" && await check.call((navigatorObject as BraveNavigator).brave) === true;
  } catch {
    return false;
  }
}

export type LiveProxyBackend = "checking" | "catalog" | "legacy" | "unavailable";
export function browserLiveTransport(
  source: LiveSourceLike | undefined,
  preferFirstParty: boolean,
  backend: LiveProxyBackend,
  recentDirectFailure = false,
): LiveAccessMode {
  if (!source) return "proxy";
  // Do not route an already working browser stream through a backend that is
  // confirmed absent; keep ordinary Edge/Chrome routing unchanged.
  if (preferFirstParty && backend !== "unavailable") return "proxy";
  if (recentDirectFailure) return "proxy";
  return initialLiveMode(source);
}

/** Media autoplay policy block is not a broken source or CDN HTTP failure. */
export function needsPlaybackGesture(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const obj = error as { name?: unknown; message?: unknown };
  if (obj.name === "NotAllowedError") return true;
  const message = typeof obj.message === "string" ? obj.message : "";
  return /(?:play\(\)|autoplay|user gesture|user interaction|user activation).*?(?:not allowed|denied|blocked|interact|gesture|required)|(?:not allowed|denied|blocked).*?(?:autoplay|play\(\)|user gesture|user interaction)/i.test(message);
}
