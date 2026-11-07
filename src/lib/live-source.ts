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
  if (!source.url.startsWith("https://")) return "proxy";
  // Referer and User-Agent cannot be set by HTMLVideoElement/hls.js.
  if (source.referer || source.agente) return "proxy";
  const format = classifyLiveSource(source);
  if (format === "dash" && source.chave) return "direct";
  if (format === "hls" && /\.txt(?:\?|$)/i.test(source.url)) return "proxy";
  return "direct";
}

export function nextLiveMode(source: LiveSourceLike, current: LiveAccessMode, alreadyTried: ReadonlySet<LiveAccessMode>): LiveAccessMode | null {
  const alternate = current === "direct" ? "proxy" : "direct";
  if (alreadyTried.has(alternate)) return null;
  // Never load plain HTTP as a top-level media URL in an HTTPS app.
  if (alternate === "direct" && !source.url.startsWith("https://")) return null;
  return alternate;
}
