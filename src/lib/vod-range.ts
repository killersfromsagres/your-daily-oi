// Small, finite byte ranges prevent a single MP4 proxy invocation from staying
// open for a whole movie (e.g. past a serverless function's time limit).
// The browser can request the next 4 MiB with HTTP Range as needed.
export const VOD_RANGE_CHUNK_BYTES = 4 * 1024 * 1024;

export function boundedVodRange(input: string | null, probe = false): string | null {
  if (probe) return "bytes=0-1";
  if (!input) return `bytes=0-${VOD_RANGE_CHUNK_BYTES - 1}`;
  const match = /^bytes=(\d+)-(\d*)$/i.exec(input.trim());
  if (!match) return null; // reject multipart and suffix ranges explicitly
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : Number.POSITIVE_INFINITY;
  if (!Number.isSafeInteger(start) || start < 0 ||
      (Number.isFinite(end) && (!Number.isSafeInteger(end) || end < start))) return null;
  return `bytes=${start}-${Math.min(end, start + VOD_RANGE_CHUNK_BYTES - 1)}`;
}

export function isBoundedVodReply(response: Response, requestedRange?: string): boolean {
  if (response.status !== 206) return false;
  const range = response.headers.get("content-range");
  const match = range && /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(range);
  if (!match) return false;
  const start = Number(match[1]), end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      end < start || end - start + 1 > VOD_RANGE_CHUNK_BYTES) return false;
  if (requestedRange) {
    const requested = /^bytes=(\d+)-(\d+)$/i.exec(requestedRange);
    if (!requested || start !== Number(requested[1]) || end > Number(requested[2])) return false;
  }
  return true;
}
