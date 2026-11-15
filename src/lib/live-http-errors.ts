/** Interpret HLS loading errors without mistaking a short segment delay for denial. */
export function terminalHlsLoadFailure(status: number, detail: string, fatal: boolean): boolean {
  if (fatal) return true;
  if ([401, 403, 410, 429].includes(status)) return true;
  // A single expired/disappearing segment can be retried by Hls.js.
  // A missing manifest/level/key cannot be recovered by retrying fragments.
  return status === 404 && /manifest|level|key/i.test(detail);
}

/**
 * A native WebView may expose MEDIA_ERR_SRC_NOT_SUPPORTED without the HTTP
 * response. Probe ONLY our own failed proxy with HEAD; never try to bypass
 * access restrictions or interrogate arbitrary third-party media URLs.
 */
export async function probeFailedLiveProxy(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  if (!/^\/api\/(?:tv\/stream|live-proxy)\?/.test(url)) return null;
  try {
    const response = await fetcher(url, {
      method: "HEAD",
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(4500),
    });
    await response.body?.cancel().catch(() => {});
    return [401, 403, 404, 410].includes(response.status) ? response.status : null;
  } catch { return null; }
}

export function accessDeniedLiveSource(status: number, detail: string): boolean {
  return [401, 403, 410].includes(status) ||
    (status === 404 && /manifest|level|key/i.test(detail));
}
