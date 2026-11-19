/**
 * Licensed first-party viewing destinations when an external TV source fails.
 * These are website links, never reusable media URLs or DRM workarounds.
 */
const PREMIERE_CATALOG = "https://globoplay.globo.com/canais/premiere/";
const PREMIERE_PAGES: Readonly<Record<string, string>> = {
  "premiere-2": "https://globoplay.globo.com/v/8221785/",
  "premiere-3": "https://globoplay.globo.com/v/8221827/",
  "premiere-4": "https://globoplay.globo.com/v/8221820/",
  "premiere-5": "https://globoplay.globo.com/v/8221830/",
  "premiere-6": "https://globoplay.globo.com/v/8221861/",
  "premiere-7": "https://globoplay.globo.com/v/8221832/",
};

/** Returns an official, subscription-gated destination when one is known. */
export function officialTvFallback(channelId: string): string | null {
  if (!/^premiere(?:-(?:[2-9]|10|clubes))?$/.test(channelId)) return null;
  return PREMIERE_PAGES[channelId] || PREMIERE_CATALOG;
}
