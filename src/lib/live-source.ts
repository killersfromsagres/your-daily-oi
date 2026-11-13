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
  // 2026-11-13 parity audit: these origins returned valid manifests but no
  // Access-Control-Allow-Origin to the browser. Try catalog proxy first.
  if (host === "hls1.sua.tv" || host === "x1colegal.com") return "proxy";
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

/**
 * Compatibilidade de deploy: versões antigas do backend possuem /api/live-proxy,
 * mas não /api/tv/stream. Ambos usam as mesmas fontes catalogadas.
 */
/**
 * Stable source identity shared by browser and deployed catalog.
 * Used only to detect a stale/reordered list (not for authentication).
 */
export function liveSourceFingerprint(url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash = Math.imul(hash ^ url.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildLiveProxyPath(
  channelId: string,
  sourceIndex: number,
  source: LiveSourceLike,
  catalogEndpointAvailable: boolean,
): string {
  if (catalogEndpointAvailable && sourceIndex >= 0 && /^[a-z0-9-]{1,120}$/.test(channelId)) {
    const params = new URLSearchParams({
      canal: channelId,
      fonte: String(sourceIndex),
      assinatura: liveSourceFingerprint(source.url),
    });
    return "/api/tv/stream?" + params;
  }
  const params = new URLSearchParams({ url: source.url });
  if (source.referer) params.set("referer", source.referer);
  if (source.agente) params.set("ua", source.agente);
  return "/api/live-proxy?" + params;
}

/**
 * Resultado da auditoria pública: as três origens *.cdn13embed.xyz responderam
 * HTTP 403 nas 137 fontes sondadas via datacenter. Não são excluídas, porque
 * podem funcionar em outra rede; ficam apenas atrás de espelhos alternativos.
 * URLs e tokens permanecem intactos.
 */
export function orderLiveSources<T extends LiveSourceLike>(sources: readonly T[]): T[] {
  const highRisk = (source: T): boolean => {
    try {
      const host = new URL(source.url).hostname.toLowerCase();
      return host === "cdn13embed.xyz" || host.endsWith(".cdn13embed.xyz");
    } catch { return false; }
  };
  // Reachable government broadcaster with wildcard CORS was observed to
  // answer while another TV Câmara mirror timed out. Prefer the healthy
  // origin but never remove alternatives or reorder an all-degraded list.
  const highConfidence = (source: T): boolean => {
    try { return new URL(source.url).hostname.toLowerCase() === "stream3.camara.gov.br"; }
    catch { return false; }
  };
  if (sources.length < 2) return [...sources];
  return [...sources].sort((left, right) =>
    Number(highRisk(left)) - Number(highRisk(right)) ||
    Number(highConfidence(right)) - Number(highConfidence(left)));
}

/**
 * A requisição Range de um manifesto deve ser ignorada no proxy: reescrever
 * URLs de playlists filhas e segmentos altera o corpo e o Content-Length.
 * Repassar Range faz o player receber um 206 com URI relativa não reescrita.
 */
export function isLivePlaylistTarget(input: string): boolean {
  try {
    let current = new URL(input);
    for (let depth = 0; depth < 3; depth++) {
      const nested = current.searchParams.get("url");
      if (!nested || !/^https?:\/\//i.test(nested)) break;
      current = new URL(nested);
    }
    return /\.(?:m3u8?|mpd|txt)$/i.test(current.pathname);
  } catch {
    return false;
  }
}
