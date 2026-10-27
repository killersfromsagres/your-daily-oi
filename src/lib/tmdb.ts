import type { CastMember, TmdbData } from "./types";

const BASE = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_READ_TOKEN ?? "";

async function tmdbFetch(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}&language=pt-BR`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    next: { revalidate: 86400 }, // 24h
  } as RequestInit);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

export async function getTmdbData(tmdbId: number, type: "f" | "s"): Promise<TmdbData | null> {
  try {
    const mediaType = type === "f" ? "movie" : "tv";
    const [details, credits, videos] = await Promise.all([
      tmdbFetch(`/${mediaType}/${tmdbId}?append_to_response=&`).catch(() => null),
      tmdbFetch(`/${mediaType}/${tmdbId}/credits?`).catch(() => null),
      tmdbFetch(`/${mediaType}/${tmdbId}/videos?`).catch(() => null),
    ]);

    const d = details as Record<string, unknown> | null;
    const c = credits as { cast?: Record<string, unknown>[] } | null;
    const v = videos as { results?: Record<string, unknown>[] } | null;

    if (!d) return null;

    const trailer = v?.results?.find(
      (r) => r["site"] === "YouTube" && r["type"] === "Trailer"
    ) ?? v?.results?.[0];

    const cast: CastMember[] = (c?.cast ?? []).slice(0, 10).map((m) => ({
      id: Number(m["id"]),
      name: String(m["name"] ?? ""),
      character: String(m["character"] ?? ""),
      profilePath: m["profile_path"] ? String(m["profile_path"]) : null,
    }));

    const backdropPath = d["backdrop_path"] ? String(d["backdrop_path"]) : null;
    const releaseDate = String(d["release_date"] ?? d["first_air_date"] ?? "");

    return {
      overview: String(d["overview"] ?? ""),
      voteAverage: Number(d["vote_average"] ?? 0),
      backdropPath,
      backdropUrl: backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : null,
      trailerId: trailer ? String(trailer["key"]) : null,
      cast,
      releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    };
  } catch {
    return null;
  }
}
