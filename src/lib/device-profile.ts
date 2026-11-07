// src/lib/device-profile.ts — browser-independent responsive capability classification.
export type DeviceProfile = "mobile" | "web" | "tv";

export interface DeviceSignals {
  userAgent: string;
  viewportWidth: number;
  coarsePointer: boolean;
  touchPoints: number;
}

// TV engines may report Android/Linux or a desktop viewport. Identify the device,
// not just its width, before choosing the 10-foot remote-control interface.
const TV_IDENTIFIERS = /(?:smart[\s-]?tv|hbbtv|netcast|webos|web0s|tizen|roku|appletv|tvos|viera|bravia|googletv|google[\s-]?tv|android[\s-]?tv|fire[\s-]?tv|aft[a-z0-9]{3,}|shield[\s-]?tv|philips[\s-]?tv|television|opera[\s-]?tv|inettvbrowser)/i;
const MOBILE_IDENTIFIERS = /(?:mobile|iphone|ipod|ipad|tablet|kindle|silk|opera mini)/i;

export function detectDeviceProfile(signals: DeviceSignals): DeviceProfile {
  const width = Number.isFinite(signals.viewportWidth) && signals.viewportWidth > 0
    ? signals.viewportWidth : 1280;
  if (TV_IDENTIFIERS.test(signals.userAgent)) return "tv";
  if (width <= 1120) return "mobile";
  if (MOBILE_IDENTIFIERS.test(signals.userAgent) && width < 1440) return "mobile";
  if (signals.coarsePointer && signals.touchPoints > 0 && width <= 1440) return "mobile";
  return "web";
}

export function isWatchRoute(pathname: string): boolean {
  return pathname === "/assistir" || pathname.startsWith("/assistir/");
}

export function mobileTabActive(pathname: string, tab: "home" | "movies" | "tv" | "games"): boolean {
  if (tab === "home") return pathname === "/";
  if (tab === "movies") return pathname === "/generos/filmes" || pathname.startsWith("/filme/");
  if (tab === "tv") return pathname === "/tv" || pathname.startsWith("/tv/");
  return pathname === "/futebol" || pathname.startsWith("/futebol/");
}
