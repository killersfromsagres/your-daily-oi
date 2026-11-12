// src/lib/genre-matching.ts — route-safe locale/alias matching without false empty-string matches.
const ALIASES: Record<string, string[]> = {
  "ficcao cientifica": ["science fiction", "sci fi", "scifi", "science fiction fantasy", "sci fi fantasy", "ficcao cientifica"],
  "acao": ["acao", "action", "action adventure"],
  "aventura": ["aventura", "adventure", "action adventure"],
  "animacao": ["animacao", "animation", "anime"],
  "documentario": ["documentario", "documentary"],
  "comedia": ["comedia", "comedy"],
  "terror": ["terror", "horror"],
  "suspense": ["suspense", "thriller", "misterio"],
  "romance": ["romance", "romantic"],
  "fantasia": ["fantasia", "fantasy", "sci fi fantasy"],
  "drama": ["drama"],
  "shounen": ["shounen", "shonen", "sh nen"],
  "sobrenatural": ["sobrenatural", "supernatural"],
};
export function normalizeGenre(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
export function matchesGenre(slug: string, genre: string): boolean {
  const selected = normalizeGenre(slug);
  const candidate = normalizeGenre(genre);
  if (!selected || !candidate) return false;
  const accepted = ALIASES[selected] || [selected];
  return accepted.some(alias => candidate === alias ||
    candidate.startsWith(alias + " ") || candidate.endsWith(" " + alias));
}
