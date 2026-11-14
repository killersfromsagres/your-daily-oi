// src/lib/saimo-vod-proxy.ts — Cloudflare/TanStack server; media streaming with Range and HLS fallback.
import { parseSaimoVodParams } from "./saimo-vod-url";
import { boundedVodRange, isBoundedVodReply, VOD_RANGE_CHUNK_BYTES } from "./vod-range";

const SAIMO_STREAM_API = "https://saimo-tv.pages.dev/api/stream";
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 6;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

function isSafeRedirectUrl(url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      host === "metadata.google.internal" ||
      host.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return true;
}

export function rewriteVodHlsManifest(text: string, upstreamUrl: string): string {
  const proxyChild = (value: string) => {
    if (/^(?:data:|blob:)/i.test(value)) return value;
    const target = new URL(value, upstreamUrl);
    if (!isSafeRedirectUrl(target)) return value;
    return `/api/live-proxy?url=${encodeURIComponent(target.toString())}`;
  };
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_whole, uri: string) => `URI="${proxyChild(uri)}"`);
    }
    try { return proxyChild(trimmed); } catch { return line; }
  }).join("\n");
}

async function readLimitedManifest(response: Response): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_MANIFEST_BYTES) return null;
      parts.push(chunk.value);
    }
    return new TextDecoder().decode(BufferLikeConcat(parts, bytes));
  } finally {
    try { await reader.cancel(); } catch { /* no-op */ }
  }
}

// Uint8Array concatenation is supported on both Bun and Cloudflare Workers (no Buffer).
function BufferLikeConcat(parts: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const errorResponse = (message: string, status: number): Response => new Response(message, {
  status,
  headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
});

/**
 * Reproduz a resposta da API pública Saimo, seguindo cada 302 com URL verificada.
 * Envia Range até a mídia final, devolvendo 206/Content-Range em streaming.
 * Nenhuma URL arbitrária é recebida pela rota: somente tipo, ID, temporada e áudio.
 */
export async function handleSaimoVodProxy(request: Request, requestUrl = new URL(request.url)): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("Método não permitido", 405);
  }
  const params = parseSaimoVodParams(requestUrl.searchParams);
  if (!params) return errorResponse("Parâmetros de reprodução inválidos", 400);

  const upstream = new URL(process.env.SAIMO_STREAM_API || SAIMO_STREAM_API);
  if (!isSafeRedirectUrl(upstream)) return errorResponse("Origem inválida", 500);
  upstream.searchParams.set("tipo", params.tipo);
  upstream.searchParams.set("id", params.id);
  upstream.searchParams.set("versao", params.versao);
  if (params.tipo === "series") {
    upstream.searchParams.set("temp", String(params.temp));
    upstream.searchParams.set("ep", String(params.ep));
  }

  const probeOnly = requestUrl.searchParams.get("probe") === "1";
  // Every non-HLS MP4 request is finite. Long-lived open-ended requests were
  // vulnerable to Vercel invocation limits and silently stopped mid-film.
  const range = boundedVodRange(request.headers.get("range"), probeOnly || request.method === "HEAD");
  if (!range) return errorResponse("Range inválido", 416);

  let current = upstream;
  const seen = new Set<string>();
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isSafeRedirectUrl(current) || seen.has(current.toString())) {
        return errorResponse("Redirecionamento inseguro ou circular", 502);
      }
      seen.add(current.toString());

      const headers = new Headers({
        Accept: "video/mp4,application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
        Referer: "https://saimo-tv.pages.dev/",
      });
      if (range) headers.set("Range", range);
      // Timeout apenas até receber os cabeçalhos. Abortar o signal após
      // 12s cortaria um filme em reprodução mesmo com o fluxo funcionando.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(current, {
          method: "GET",
          headers,
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
        });
      } finally {
        clearTimeout(timeout);
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) return errorResponse("Redirecionamento sem destino", 502);
        current = new URL(location, current);
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel();
        return errorResponse(`Fonte de vídeo indisponível (HTTP ${res.status})`, res.status === 404 ? 404 : 502);
      }

      const rawType = (res.headers.get("content-type") || "").toLowerCase();
      const path = current.pathname.toLowerCase();
      const hls = /(?:mpegurl|vnd\.apple\.mpegurl)/.test(rawType) ||
        (/(?:\.m3u8|\.m3u)(?:$)/.test(path) && !/video\//.test(rawType));
      if (/(?:text\/html|application\/json)/.test(rawType)) {
        await res.body?.cancel();
        return errorResponse("Resposta da origem não é um vídeo", 502);
      }

      if (probeOnly) {
        await res.body?.cancel();
        return new Response(JSON.stringify({
          ok: true,
          format: hls ? "hls" : rawType.includes("video/mp2t") ? "ts" : "mp4",
          contentType: rawType,
          rangeSupported: res.status === 206 || res.headers.get("accept-ranges") === "bytes",
        }), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }

      if (hls) {
        if (request.method === "HEAD") {
          await res.body?.cancel();
          return new Response(null, {
            status: 200,
            headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
          });
        }
        const text = await readLimitedManifest(res);
        if (!text || !text.trimStart().startsWith("#EXTM3U")) {
          return errorResponse("Playlist HLS ausente ou inválida", 502);
        }
        return new Response(rewriteVodHlsManifest(text, current.toString()), {
          headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
        });
      }

      // An upstream that ignores Range cannot offer reliable seeking via this
      // endpoint. Never masquerade a full 200 body as partial media or keep
      // a 2-hour file flowing through one short-lived serverless invocation.
      if (res.status === 206 && !isBoundedVodReply(res)) {
        await res.body?.cancel();
        return errorResponse("Faixa de vídeo inválida na origem", 502);
      }
      if (res.status === 200 && (
        !Number.isFinite(Number(res.headers.get("content-length"))) ||
        Number(res.headers.get("content-length")) <= 0 ||
        Number(res.headers.get("content-length")) > VOD_RANGE_CHUNK_BYTES
      )) {
        await res.body?.cancel();
        return errorResponse("Servidor sem suporte a reprodução por partes", 502);
      }

      const out = new Headers({ "Content-Type": rawType || "video/mp4", "Cache-Control": "no-store" });
      for (const header of ["content-range", "content-length", "accept-ranges", "etag", "last-modified"]) {
        const value = res.headers.get(header);
        if (value) out.set(header, value);
      }
      if (res.status === 206) out.set("Accept-Ranges", "bytes");
      if (request.method === "HEAD") {
        await res.body?.cancel();
        return new Response(null, { status: 200, headers: out });
      }
      return new Response(res.body, { status: res.status, headers: out });
    }
    return errorResponse("Limite de redirecionamentos excedido", 502);
  } catch (error) {
    const kind = error instanceof Error ? error.name : "network";
    console.warn("[SaimoVod] Falha de comunicação upstream:", kind);
    return errorResponse("Falha ao conectar ao vídeo no Zang Flix", 502);
  }
}
