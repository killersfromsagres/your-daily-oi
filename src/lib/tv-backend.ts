/** Detect which same-origin TV proxy routes are actually deployable.
 * Vercel cold starts can time out one route; each fallback MUST get its own
 * AbortController (older code reused an already-aborted signal).
 */
export type TvProxyBackend = "catalog" | "legacy" | "unavailable";

async function timedProbe(path: string, fetcher: typeof fetch, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(path, { signal: controller.signal, cache: "no-store" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function detectTvProxyBackend(
  fetcher: typeof fetch = fetch,
  timeoutMs = 9000,
): Promise<TvProxyBackend> {
  const modern = await timedProbe("/api/tv/stream?canal=%21&fonte=0", fetcher, timeoutMs);
  if (modern?.status === 400 && (modern.headers.get("content-type") || "").includes("json")) {
    try {
      const parsed: unknown = await modern.json();
      if (parsed && typeof parsed === "object" && "error" in parsed &&
          typeof (parsed as {error?: unknown}).error === "string") return "catalog";
    } catch { /* legacy fallback uses independent timeout */ }
  }
  await modern?.body?.cancel().catch(() => {});
  const legacy = await timedProbe("/api/live-proxy", fetcher, timeoutMs);
  const available = legacy?.status === 400;
  await legacy?.body?.cancel().catch(() => {});
  return available ? "legacy" : "unavailable";
}
