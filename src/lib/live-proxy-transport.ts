/** HTTP normalization for live channels; never lie about a CDN's response size. */
export function liveMediaHeaders(upstream: Headers, status: number, fallback = "video/mp2t"): Headers {
  const h = new Headers({
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":"*",
    "Cache-Control":"no-cache, no-store, must-revalidate",
    "Content-Type":upstream.get("content-type") || fallback,
  });
  // Undici transparently decompresses data; a forwarded Content-Length can
  // describe another number of bytes or be incorrect in the first place.
  if (status === 206) {
    const range = upstream.get("content-range") || "";
    if (/^bytes\s+\d+-\d+\/(?:\d+|\*)$/i.test(range)) h.set("Content-Range", range);
    h.set("Accept-Ranges", "bytes");
  } else if (upstream.get("accept-ranges")?.toLowerCase() === "bytes") {
    h.set("Accept-Ranges", "bytes");
  }
  return h;
}
export function isLiveHlsMime(type: string): boolean {
  const mime = type.toLowerCase().split(";")[0]?.trim();
  return /^(?:application\/(?:vnd\.apple\.mpegurl|x-mpegurl|mpegurl)|audio\/(?:x-)?mpegurl)$/.test(mime || "");
}
/** Endless MPEG-TS streams must not occupy a Vercel invocation for 300s. */
export function isContinuousTs(response: Response, range: string | null): boolean {
  if (range || response.status === 206) return false;
  const mime = (response.headers.get("content-type") || "").toLowerCase();
  if (!/(?:video\/mp2t|video\/mpegts|application\/x-mpegts)/.test(mime)) return false;
  const size = Number(response.headers.get("content-length"));
  return !response.headers.has("content-length") || !Number.isFinite(size) || size > 64*1024*1024;
}
export function finiteLiveBody(body: ReadableStream<Uint8Array>, timeMs = 80_000): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const endAt = Date.now() + timeMs;
  let ended = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (ended) return;
      const remain = endAt - Date.now();
      if (remain <= 0) {
        ended = true; controller.close();
        void reader.cancel("restart-continuous-live").catch(() => {});
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          reader.read().then(value => ({ kind:"data" as const, value })),
          new Promise<{kind:"timeout"}>(resolve => { timer = setTimeout(() => resolve({kind:"timeout"}), remain); }),
        ]);
        if (result.kind === "timeout") {
          ended = true; controller.close();
          void reader.cancel("restart-continuous-live").catch(() => {});
        } else if (result.value.done) {
          ended = true; controller.close();
        } else {
          controller.enqueue(result.value.value);
        }
      } catch (err) {
        ended = true; controller.error(err);
      } finally { if (timer) clearTimeout(timer); }
    },
    async cancel(reason) {
      ended = true;
      await reader.cancel(reason).catch(() => {});
    },
  });
}
