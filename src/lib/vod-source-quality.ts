// src/lib/vod-source-quality.ts — ranked VOD source selection, shared by player and providers.
import type { StreamSource } from "./types";

const BAD_CAPTURE = /(?:^|[^a-z0-9])(?:hdcam|camrip|cam|telesync|hdts|telecine|tc-rip|ts-rip|dublagem\\s*(?:de|do)\\s*cinema|som\\s*(?:de|do)\\s*cinema|cinema\s*(?:audio|rip|dub|dublagem|captur)|gravado\s*(?:no|em)\s*cinema|audio\s*(?:de|do)\s*cinema|mic\s*audio|line\s*audio|screener|dvdscr)(?:$|[^a-z0-9])/i;
const AD_MARKERS = /(?:^|[^a-z0-9])(?:1xbet|xbet|22bet|bet365|stake\s*casino|betwinner|sportingbet|betano|pixbet|betfair|blaze\s*bet|casino\s*ads?|ad[-\s]?watermark|watermarked|marca\s*d.?agua\s*(?:xbet|bet|casino)|ads?\s*(?:inserted|embed|overlay)|propaganda\s*(?:de\s*)?apostas?)(?:$|[^a-z0-9])/i;

/** Only block strong evidence in source metadata; do not infer CAM from file format MPEG-TS. */
export function rejectedVodSourceReason(source: Pick<StreamSource,"url"|"name"|"quality">): "cinema" | "ads" | null {
  const details = [source.name || "", source.quality || ""].join(" ").toLowerCase();
  let pathname = "";
  try {
    const url = new URL(source.url, "https://zangflix.example");
    pathname = decodeURIComponent(url.pathname).toLowerCase();
    // Include only non-secret, meaningful URL path/host parts; signed query
    // tokens are not metadata and often contain false matches.
    const host = url.hostname.toLowerCase();
    pathname += " " + host;
    for (const [key, value] of url.searchParams) {
      if (/^(?:wm|watermark|brand|ad|ads|promo|advert|label)$/i.test(key)) {
        pathname += " " + value;
      }
    }
  } catch {
    pathname = source.url.split("?")[0].toLowerCase();
  }
  const evidence = details + " " + pathname.replace(/[._-]/g, " ");
  if (BAD_CAPTURE.test(evidence)) return "cinema";
  if (AD_MARKERS.test(evidence)) return "ads";
  return null;
}

export function advertisedVodResolution(source: {url:string; quality?:string | undefined; name?:string | undefined}): number | null {
  // A URL or source label can claim quality; real height is only available
  // from loaded video metadata and is kept separate from advertised quality.
  const value = [source.quality, source.name, source.url.split("?")[0]].filter(Boolean).join(" ").toLowerCase();
  if (/\b(?:8k|4320p?)\b/.test(value)) return 4320;
  if (/\b(?:4k|2160p?|uhd)\b/.test(value)) return 2160;
  if (/\b(?:2k|1440p?|qhd)\b/.test(value)) return 1440;
  if (/\b(?:1080p?|fhd|full[\s-]?hd)\b/.test(value)) return 1080;
  if (/\b(?:720p?|hd[\s-]?ready)\b/.test(value)) return 720;
  if (/\b(?:480p?|sd)\b/.test(value)) return 480;
  if (/\b360p?\b/.test(value)) return 360;
  if (/\b240p?\b/.test(value)) return 240;
  return null;
}

export interface VodSourceSelection {
  preferredAudio?: "dub" | "leg";
  failedUrls?: ReadonlySet<string>;
  observedHeights?: ReadonlyMap<string, number>;
  excludedUrls?: ReadonlySet<string>;
}

export function vodSourceScore(source: StreamSource, options: VodSourceSelection = {}): number {
  if (!source?.url || rejectedVodSourceReason(source)) return -Infinity;
  if (options.excludedUrls?.has(source.url)) return -Infinity;

  const preferred = options.preferredAudio || "dub";
  // Prioritize Brazilian Portuguese dubbing over a high resolution subtitle-only version.
  let score = source.audio === preferred ? (source.audioDeclared === false ? 1600 : 7000) : 0;
  const observedHeight = options.observedHeights?.get(source.url);
  const advertised = advertisedVodResolution(source);
  const resolution = observedHeight && observedHeight > 0 ? observedHeight : advertised;

  if (resolution) {
    // Do not reward made-up high numbers aggressively; all unverified labels
    // carry less weight than a measured resolution.
    const height = Math.min(resolution, 2160);
    const points = height >= 2160 ? 1100 : height >= 1440 ? 950
      : height >= 1080 ? 790 : height >= 720 ? 530
      : height >= 480 ? 180 : -450;
    score += observedHeight ? points * 1.2 : points * 0.7;
  }
  // Source identity alone is not proof of better image quality.
  if (source.url.startsWith("https://") || source.url.startsWith("/api/")) score += 60;
  if (source.format === "hls") score += 50; // adaptive bitrate when present
  if (source.priority !== undefined) {
    const prio = Math.max(-25, Math.min(25, source.priority));
    score -= prio * 6;
    if (source.priority <= -200) score += 210; // confirmed episode in catalogue
  }
  if (options.failedUrls?.has(source.url)) score -= 4500;
  return score;
}

export function playableVodSources<T extends StreamSource>(streams: readonly T[]): T[] {
  return streams.filter(s => !!s?.url && !rejectedVodSourceReason(s));
}

export function bestVodSourceIndex(streams: readonly StreamSource[], options: VodSourceSelection = {}): number {
  let best = -1, score = -Infinity;
  for (let i = 0; i < streams.length; i++) {
    const source = streams[i];
    if (!source) continue;
    const current = vodSourceScore(source, options);
    if (current > score) { score = current; best = i; }
  }
  return best;
}

/** Return -1 if there are no safe, untried alternatives. */
export function nextVodSourceIndex(
  streams: readonly StreamSource[],
  current: number,
  excludedUrls: ReadonlySet<string>,
  options: VodSourceSelection = {},
): number {
  const currentUrl = streams[current]?.url;
  return bestVodSourceIndex(streams, {
    ...options,
    excludedUrls: new Set([
      ...excludedUrls,
      ...(currentUrl ? [currentUrl] : []),
    ]),
  });
}
