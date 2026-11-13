// src/lib/live-probe.ts — Cloudflare worker, a bounded content-type probe for catalog-backed live sources.
import { loadCanais } from "./canais";
import { classifyLiveSource, liveSourceFingerprint, type LiveStreamFormat } from "./live-source";

const resultCache = new Map<string, { format: LiveStreamFormat; expires: number }>();
const FORMATS: Readonly<Record<string, LiveStreamFormat>> = {
  "application/vnd.apple.mpegurl": "hls",
  "application/x-mpegurl": "hls",
  "application/dash+xml": "dash",
  "video/mp2t": "ts",
  "video/mp4": "mp4",
  "application/mp4": "mp4",
};
function mediaFormat(type: string): LiveStreamFormat {
  const mime = type.toLowerCase().split(";")[0]?.trim() || "";
  return FORMATS[mime] || "auto";
}
function allowedRedirect(url: URL): boolean {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|\[::1\])/.test(host)) return false;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return true;
}
function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export async function handleLiveFormatApi(url: URL): Promise<Response> {
  const id = url.searchParams.get("canal") || "";
  const sourceParam = url.searchParams.get("fonte") || "";
  if (!/^[a-z0-9-]{1,100}$/.test(id) || !/^(?:0|[1-9]\d{0,3})$/.test(sourceParam)) {
    return respond({ error: "Canal ou fonte inválidos" }, 400);
  }
  const sourceIndex = Number(sourceParam);
  const signature = url.searchParams.get("assinatura");
  if (signature !== null && !/^[a-f0-9]{8}$/.test(signature)) {
    return respond({ error: "Identificador de fonte inválido" }, 400);
  }
  const { canais } = await loadCanais();
  const channel = canais.find((item) => item.id === id);
  let source = channel?.fontes[sourceIndex];
  if (signature && (!source || liveSourceFingerprint(source.url) !== signature)) {
    source = channel?.fontes.find(item => liveSourceFingerprint(item.url) === signature);
    if (!source) return respond({ error: "Fonte desatualizada" }, 409);
  }
  if (!source) return respond({ error: "Fonte não encontrada" }, 404);

  const staticFormat = classifyLiveSource(source);
  if (staticFormat !== "auto") return respond({ format: staticFormat, inferred: true });

  const cacheKey = source.url;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return respond({ format: cached.format, inferred: false });

  let current = new URL(source.url);
  const visited = new Set<string>();
  let format: LiveStreamFormat = "auto";
  try {
    for (let hops = 0; hops < 4; hops++) {
      if (!allowedRedirect(current) || visited.has(current.href)) break;
      visited.add(current.href);
      const headers = new Headers({ Accept: "*/*", Range: "bytes=0-1" });
      if (source.referer) headers.set("Referer", source.referer);
      if (source.agente) headers.set("User-Agent", source.agente);
      const response = await fetch(current, {
        redirect: "manual",
        headers,
        signal: AbortSignal.timeout(4500),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) break;
        current = new URL(location, current);
        continue;
      }
      if (response.ok) format = mediaFormat(response.headers.get("content-type") || "");
      await response.body?.cancel();
      break;
    }
  } catch {
    // Player attempts both browser and server paths even when this probe cannot reach a CDN.
  }
  if (resultCache.size > 800) resultCache.clear();
  resultCache.set(cacheKey, { format, expires: Date.now() + (format === "auto" ? 30_000 : 5 * 60_000) });
  return respond({ format, inferred: false });
}
