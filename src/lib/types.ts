/* ── Catalog & Media Types ────────────────────────────────────── */

export type AudioTrack = "dub" | "leg";
export type StreamFormat = "hls" | "ts" | "dash" | "mp4" | "auto";

export interface StreamSource {
  url: string;
  name?: string;
  format?: StreamFormat;
  audio: AudioTrack;
  priority?: number;
  quality?: string;
  /** Whether a provider actually labelled the language, rather than our best guess. */
  audioDeclared?: boolean;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
}

export interface TmdbData {
  title?: string;
  overview: string;
  voteAverage: number;
  backdropPath: string | null;
  backdropUrl: string | null;
  backdropWidth?: number;
  backdropHeight?: number;
  posterPath?: string | null;
  trailerId: string | null;
  cast: CastMember[];
  releaseYear: number | null;
  runtime?: number | null; // Duração em minutos
  seasonsCount?: number | null; // Total de temporadas
  studio?: string | null;
  format?: string | null;
}

export interface EpisodeItem {
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
  name?: string;
  episodeSlug?: string;
  /** Verified credit start in seconds; cue appears one second later. */
  creditsStartSeconds?: number;
  thumbUrl?: string;
  streams: StreamSource[];
}

export interface SeasonItem {
  seasonNumber: number;
  episodes: EpisodeItem[];
}

export interface CatalogItem {
  id: string;
  title: string;
  type: "f" | "s" | "a";
  posterPath?: string;
  posterUrl?: string;
  genres: string[];
  streams: StreamSource[];
  tmdbId?: number | null;
  tmdb?: TmdbData | null;
  seasons?: SeasonItem[];
  alias?: boolean;
}

export interface HighlightItem {
  type: "f" | "s" | "a";
  title: string;
  letter: string;
  year: string;
  posterPath: string;
}

export interface HighlightRow {
  rowName: string;
  items: HighlightItem[];
}

export interface WatchProgress {
  id: string;
  contentId?: string;
  type: "f" | "s" | "a";
  title: string;
  posterUrl?: string;
  season?: number;
  episode?: number;
  currentTime: number;
  duration?: number;
  updatedAt: number;
}
