/**
 * Allowlisted, first-party broadcaster pages for verified individual matches.
 * A web landing page is not an embeddable media stream or a license.
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
    if (url.hostname === "globoplay.globo.com" && url.pathname === "/canais/premiere/") {
      return { href: url.href, provider: "Premiere (Globoplay)", subscriptionRequired: true };
    }
    if (url.hostname === "www.primevideo.com" && /^\/detail\/[A-Z0-9]+\/?$/.test(url.pathname)) {
      return { href: url.href, provider: "Prime Video", subscriptionRequired: true };
    }
  } catch { /* Reject malformed destinations. */ }
  return null;
}
