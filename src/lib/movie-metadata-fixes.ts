import type { CatalogItem, TmdbData } from "./types";

/** TMDB's 1994 live-action movie, not the distinct 2026 reboot. */
export const STREET_FIGHTER_1994_TMDB_ID = 11667;

/**
 * Only the unqualified catalogue title and the known 1994 Brazilian titles
 * are treated as the classic film. Explicitly year-qualified 2026 entries
 * remain separate. The catalogue's route ID and stream lookup are untouched.
 */
export function isClassicStreetFighter(title: string, type: string): boolean {
  if (type !== "f" || /\b2026\b/.test(title)) return false;
  const normalized = title.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b1994\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  return /^(street fighter|street fighter a batalha final|street fighter a ultima batalha)$/.test(normalized);
}

export function correctClassicStreetFighter<T extends Pick<CatalogItem, "type" | "title" | "tmdbId" | "tmdb" | "posterUrl" | "posterPath">>(
  item: T,
  rawTitle = item.title,
): T {
  if (!isClassicStreetFighter(rawTitle, item.type)) return item;
  const fallback: TmdbData = {
    title: "Street Fighter - A Batalha Final",
    overview: "O coronel Guile reúne uma equipe de combatentes para resgatar reféns do General M. Bison.",
    voteAverage: 0,
    backdropPath: null,
    backdropUrl: null,
    trailerId: null,
    cast: [],
    releaseYear: 1994,
    runtime: 102,
  };
  return {
    ...item,
    tmdbId: STREET_FIGHTER_1994_TMDB_ID,
    tmdb: fallback,
    // Do not display a 2026 reboot poster on the 1994 film while
    // the correct 1994 TMDB artwork is being resolved by the API.
    posterUrl: "",
    posterPath: "",
  };
}
