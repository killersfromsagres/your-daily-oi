// src/lib/live-source.ts — browser/server, Saimo live source classification and playback policy.
export interface LiveSourceLike {
  url: string;
  referer?: string;
  agente?: string;
  chave?: string;
}
export type LiveStreamFormat = "hls" | "dash" | "ts" | "mp4" | "auto";
export type LiveAccessMode = "direct" | "proxy";

function effectiveStreamUrl(input: string): URL | null {
  try {
    let url = new URL(input);
    // Saimo and third-party links sometimes wrap a stream under ?url=.
    for (let i = 0; i < 3; i++) {
      const nested = url.searchParams.get("url");
      if (!nested || !/^https?:\/\//i.test(nested)) break;
      url = new URL(nested);
    }
    return url;
  } catch {
    return null;
  }
}

export function classifyLiveSource(source: LiveSourceLike): LiveStreamFormat {
  if (source.chave) return "dash";
  const url = effectiveStreamUrl(source.url);
  if (!url) return "auto";
  const pathname = url.pathname.toLowerCase();
  if (/\.mpd$/.test(pathname)) return "dash";
  if (/\.(m3u8|m3u|txt)$/.test(pathname)) return "hls";
  if (/\.ts$/.test(pathname)) return "ts";
  if (/\.(mp4|m4v)$/.test(pathname)) return "mp4";
  return "auto";
}

export function looksOffline(source: LiveSourceLike): boolean {
  const url = effectiveStreamUrl(source.url);
  return !url ||
    !["http:", "https:"].includes(url.protocol) ||
    /\/(?:error|offline|off)\.(?:txt|m3u8?)$/i.test(url.pathname);
}

export function initialLiveMode(source: LiveSourceLike | undefined): LiveAccessMode {
  if (!source) return "proxy";
  const url = effectiveStreamUrl(source.url);
  if (!url) return "proxy";
  if (url.protocol !== "https:") return "proxy"; // mixed-content on an HTTPS page
  const host = url.hostname.toLowerCase();
  // Public Saimo frontend prioritizes direct HLS for its CDN hosts even when
  // a Referer/UA is provided for its *fallback* proxy route. The viewer's
  // residential connection often works when an edge/datacenter proxy gets 403.
  if (host.includes("s23-cloudfront-net.lat") || host.includes("s25-cloudfront-net.lat")) return "direct";
  if (url.pathname.toLowerCase().endsWith(".txt")) return "proxy";
  if (host.includes("dadinhodetapioca.fun")) return "proxy";
  return "direct";
}

export function nextLiveMode(source: LiveSourceLike, current: LiveAccessMode, alreadyTried: ReadonlySet<LiveAccessMode>): LiveAccessMode | null {
  const alternate = current === "direct" ? "proxy" : "direct";
  if (alreadyTried.has(alternate)) return null;
  // Never load plain HTTP as a top-level media URL in an HTTPS app.
  if (alternate === "direct" && !source.url.startsWith("https://")) return null;
  return alternate;
}
