// Enriquecimento server-side de animes via AniList GraphQL
const anilistCache = new Map<string, { data: { studio: string | null; format: string | null }; expires: number }>();

export async function getAniListMetadata(title: string): Promise<{ studio: string | null; format: string | null } | null> {
  const norm = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const cached = anilistCache.get(norm);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        format
        studios(isMain: true) {
          nodes {
            name
          }
        }
      }
    }
  `;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { search: title },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = (await res.json()) as {
      data?: {
        Media?: {
          format?: string;
          studios?: { nodes?: Array<{ name: string }> };
        };
      };
    };

    const media = json.data?.Media;
    const studio = media?.studios?.nodes?.[0]?.name || null;
    const format = media?.format || null;

    const result = { studio, format };
    anilistCache.set(norm, { data: result, expires: Date.now() + 86400000 });
    return result;
  } catch {
    return null;
  }
}
