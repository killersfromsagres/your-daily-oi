/**
 * Cloudflare/Lovable is the same ZANG FLIX deployment as Vercel.
 * Use its catalog-indexed HLS endpoint only after a Vercel transport outage.
 * A cold start can make backend detection return "legacy"/"unavailable", even
 * though the owned backup supports the signed catalog endpoint. Don't gate the
 * rescue on the health of the already-failing Vercel API.
 * Never route 401/403/404 or arbitrary user-supplied stream URLs this way.
 */
export const ZANG_TV_EDGE_ORIGIN = "https://zangflix.lovable.app";

/** Recognize the production domain and Vercel's generated preview domains. */
export function isZangVercelTvHost(hostname: string): boolean {
  return hostname === "zangflix.vercel.app" ||
    /^zangflix-[a-z0-9-]+\.vercel\.app$/i.test(hostname);
}

export function shouldTryTvEdgeBackup({
  hostname, mode, proxyPath, upstreamStatus, tried,
}: {
  hostname: string;
  mode: "direct" | "proxy";
  backend: "checking" | "catalog" | "legacy" | "unavailable";
  proxyPath: string;
  upstreamStatus: number | null | undefined;
  tried: boolean;
}): boolean {
  return isZangVercelTvHost(hostname) &&
    mode === "proxy" &&
    !tried &&
    /^\/api\/tv\/stream\?/.test(proxyPath) &&
    [0, 502, 503, 504].includes(upstreamStatus ?? -1);
}

export function tvEdgeBackupUrl(path: string): string | null {
  if (!/^\/api\/tv\/stream\?/.test(path)) return null;
  const url = new URL(path, ZANG_TV_EDGE_ORIGIN);
  const id = url.searchParams.get("canal");
  const idx = url.searchParams.get("fonte");
  const signature = url.searchParams.get("assinatura");
  if (!id || !/^[a-z0-9-]{1,120}$/.test(id) ||
      !idx || !/^(0|[1-9]\d{0,3})$/.test(idx) ||
      !signature || !/^[a-f0-9]{8}$/.test(signature)) return null;
  if ([...url.searchParams.keys()].some(key => !["canal","fonte","assinatura"].includes(key))) return null;
  return url.toString();
}
