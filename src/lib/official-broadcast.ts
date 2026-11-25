/**
 * Allowlisted official streaming destinations for event-exclusive services.
 * A verified Premiere network listing may link to its official subscription
 * page externally; it is never an embeddable video source.
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
    if (url.hostname === "globoplay.globo.com" && url.port === "" &&
        url.pathname === "/canais/premiere/") {
      return { href: url.href, provider: "Premiere", subscriptionRequired: true };
    }
    if (url.hostname === "www.primevideo.com" && /^\/detail\/[A-Z0-9]+\/?$/.test(url.pathname)) {
      return { href: url.href, provider: "Prime Video", subscriptionRequired: true };
    }
  } catch { /* Reject malformed destinations. */ }
  return null;
}
