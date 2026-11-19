/**
 * Allowlisted official streaming destinations for event-exclusive services.
 * A Premiere network listing is NOT an embeddable stream and must stay in
 * the site's own channel selection (never open a browser link as a video).
 */
export interface OfficialBroadcastTarget {
  href: string;
  provider: string;
  subscriptionRequired: boolean;
}

export function officialBroadcastTarget(candidate?: string | null): OfficialBroadcastTarget | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (url.hostname === "www.primevideo.com" && /^\/detail\/[A-Z0-9]+\/?$/.test(url.pathname)) {
      return { href: url.href, provider: "Prime Video", subscriptionRequired: true };
    }
  } catch { /* Reject malformed destinations. */ }
  return null;
}
