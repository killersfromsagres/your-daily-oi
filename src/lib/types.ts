/* ── Catalog Types ─────────────────────────────────────────── */

export interface StreamSource {
  /** "dub" = dublado, "leg" = legendado */
  audio: "dub" | "leg";
  /** URL ou identificador do stream */
  url: string;
  /** Qualidade opcional (e.g. "1080p", "720p") */
  quality?: string;
}

export interface TmdbMeta {
  /** Ano de lançamento */
  releaseYear?: number;
  /** Nota média (0–10) */
  voteAverage?: number;
  /** Gêneros em texto */
  genres?: string[];
  /** Sinopse */
  overview?: string;
  /** Caminho do backdrop no TMDB */
  backdropPath?: string;
}

export interface CatalogItem {
  /** UUID único do item */
  id: string;
  /** Título de exibição */
  title: string;
  /** "f" = filme, "s" = série */
  type: "f" | "s";
  /** URL do poster (2:3) */
  posterUrl?: string;
  /** Fontes de stream disponíveis */
  streams: StreamSource[];
  /** Metadados do TMDB (opcional) */
  tmdb?: TmdbMeta;
  /** Tags/categorias livres */
  tags?: string[];
}
