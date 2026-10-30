import type { CastMember, TmdbData } from "./types";

const BASE = "https://api.themoviedb.org/3";
const DEFAULT_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkNzg1NjM4YWUyMjVlZjU2YmMyZTY0MWZiMWQ0ZmEzMCIsIm5iZiI6MTc4ODA1NjI4Mi4wOTQsInN1YiI6IjZhOTM5MmRhMjY3N2UzZDAzMDVhZTg1OSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.7BB7PS-QrWu7zpaY9Eu47eXYLwlOkq1QVVGs7uxre_A";
const DEFAULT_KEY = "d785638ae225ef56bc2e641fb1d4fa30";

const TOKEN = process.env.TMDB_READ_TOKEN || DEFAULT_TOKEN;
const API_KEY = process.env.TMDB_API_KEY || DEFAULT_KEY;

async function tmdbFetch(path: string): Promise<unknown> {
  const separator = path.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${BASE}${path}${separator}language=pt-BR`, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      next: { revalidate: 86400 },
    } as RequestInit);
    if (res.ok) return await res.json();
  } catch {
    // Tenta fallback com api_key na query string
  }

  // Fallback via api_key
  const resFallback = await fetch(`${BASE}${path}${separator}api_key=${API_KEY}&language=pt-BR`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!resFallback.ok) throw new Error(`TMDB ${resFallback.status}`);
  return await resFallback.json();
}

export interface TmdbEpisodeItem {
  numero: number;
  nome: string;
  sinopse: string;
  still: string | null;
  duracao: string | null;
}

export async function getTmdbSeasonEpisodes(
  tmdbId: number,
  seasonNumber: number
): Promise<TmdbEpisodeItem[]> {
  try {
    const data = (await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}?`)) as {
      episodes?: Array<{
        episode_number: number;
        name?: string;
        overview?: string;
        still_path?: string | null;
        runtime?: number | null;
      }>;
    } | null;
    if (!data || !Array.isArray(data.episodes)) return [];
    return data.episodes.map((ep) => ({
      numero: ep.episode_number,
      nome: ep.name || `Episódio ${ep.episode_number}`,
      sinopse: ep.overview || "",
      still: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
      duracao: ep.runtime ? `${ep.runtime} min` : null,
    }));
  } catch {
    return [];
  }
}

export async function getTmdbTvSeasons(
  tmdbId: number
): Promise<Array<{ season_number: number; episode_count: number }> | null> {
  try {
    const details = (await tmdbFetch(`/tv/${tmdbId}?`)) as Record<string, unknown> | null;
    if (!details || !Array.isArray(details["seasons"])) return null;
    return (details["seasons"] as Record<string, unknown>[]).map((s) => ({
      season_number: Number(s["season_number"] ?? 0),
      episode_count: Number(s["episode_count"] ?? 0),
    }));
  } catch {
    return null;
  }
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
    const runtime = typeof d["runtime"] === "number" ? d["runtime"] : null;
    const seasonsCount = typeof d["number_of_seasons"] === "number" ? d["number_of_seasons"] : null;

    return {
      overview: String(d["overview"] ?? ""),
      voteAverage: Number(d["vote_average"] ?? 0),
      backdropPath,
      backdropUrl: backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : null,
      trailerId: trailer ? String(trailer["key"]) : null,
      cast,
      releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
      runtime,
      seasonsCount,
    };
  } catch {
    return null;
  }
}
