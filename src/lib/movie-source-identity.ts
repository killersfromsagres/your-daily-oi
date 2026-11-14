import quarantine from "./movie-source-quarantine.json";
import { movieSourceFingerprint } from "./movie-source-fingerprint";
import { isClassicStreetFighter, STREET_FIGHTER_1994_TMDB_ID } from "./movie-metadata-fixes";
import type { CatalogItem, StreamSource } from "./types";

const quarantinedFingerprints=new Set(quarantine.fingerprints);
export const isQuarantinedMovieSource=(url:string):boolean=>quarantinedFingerprints.has(movieSourceFingerprint(url));

/** Playback keys retain the edition year; display/search keys deliberately do not. */
export function movieTitleKey(title: string): string {
  let value = title;
  try { value = decodeURIComponent(value); } catch { /* Literal percent sign. */ }
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\+/g, " ").toLowerCase().replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ").trim();
}
export const movieTitleYear = (title: string): number | undefined => {
  const match = /\((\d{4})\)\s*$/.exec(title);
  return match ? Number(match[1]) : undefined;
};
const withoutYear = (title: string) => title.replace(/\s*\(\d{4}\)\s*$/, "");
/** Confirmed upstream alias errors. Keep route IDs; correct only content identity. */
export function canonicalMovieId(title:string,id:number): number {
  if(isClassicStreetFighter(title,"f"))return STREET_FIGHTER_1994_TMDB_ID;
  // The legacy sixth-part alias incorrectly points at the 2009 remake.
  if(/^sexta[. ]feira[. ]13\s*-\s*6$/i.test(title.trim()))return 10225;
  return id;
}
export type MovieIdentityMap = Map<string, Set<number>>;

export function movieIdentityMap(text: string): MovieIdentityMap {
  const result: MovieIdentityMap = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [type, title, rawId] = line.split("\t");
    const id = Number(rawId);
    if (type !== "f" || !title || !Number.isSafeInteger(id) || id <= 0) continue;
    const key = movieTitleKey(title);
    const ids = result.get(key) || new Set<number>();
    ids.add(canonicalMovieId(title,id)); result.set(key, ids);
  }
  return result;
}

/** Only recognized playback endpoints expose a TMDB id; opaque CDN ids do not. */
export function sourceMovieId(url: string): number | null {
  try {
    const parsed = new URL(url, "https://zangflix.invalid");
    if (!/^\/api\/(?:stream|saimo-vod)$/.test(parsed.pathname)) return null;
    if (parsed.searchParams.get("tipo") === "series") return null;
    const raw = parsed.searchParams.get("id") || "";
    return /^\d+$/.test(raw) ? Number(raw) : null;
  } catch { return null; }
}
export const movieSourceMatches = (source: StreamSource, id?: number | null): boolean => {
  const declared = sourceMovieId(source.url);
  return !id || declared === null || declared === id;
};
export interface MovieSourceRow { title: string; streams: StreamSource[] }
export interface MovieSourceIndex {
  byId: Map<number, StreamSource[]>;
  byTitle: Map<string, StreamSource[]>;
  collisions: number;
  mismatchedRelays: number;
  ambiguousSources: number;
}

/** Same-id aliases may share sources; remakes and homonyms may never share a bucket. */
export function indexMovieSources(rows: MovieSourceRow[], identities: MovieIdentityMap): MovieSourceIndex {
  const index: MovieSourceIndex = {byId:new Map(),byTitle:new Map(),collisions:0,mismatchedRelays:0,ambiguousSources:0};
  const owners = new Map<string, Set<number>>();
  const resolved = rows.map(row => {
    const ids = identities.get(movieTitleKey(row.title));
    const id = ids?.size === 1 ? [...ids][0]! : null;
    if (ids && ids.size > 1) index.collisions++;
    if (id) for (const source of row.streams) {
      if (!movieSourceMatches(source,id)) continue;
      const set = owners.get(source.url) || new Set<number>();
      set.add(id); owners.set(source.url,set);
    }
    return {row,id,ambiguous:!!ids && ids.size > 1};
  });
  const append = <K>(map:Map<K,StreamSource[]>,key:K,sources:StreamSource[]) => {
    const previous = map.get(key) || [], urls = new Set(previous.map(s=>s.url));
    map.set(key,[...previous,...sources.filter(source=>{
      if(urls.has(source.url))return false;urls.add(source.url);return true;
    })]);
  };
  for (const {row,id,ambiguous} of resolved) {
    if (ambiguous) continue;
    const sources = row.streams.filter(source => {
      if (!movieSourceMatches(source,id)) {index.mismatchedRelays++;return false;}
      if ((owners.get(source.url)?.size || 0) > 1 || isQuarantinedMovieSource(source.url)) {index.ambiguousSources++;return false;}
      return true;
    });
    append(index.byTitle,movieTitleKey(row.title),sources);
    if (id) append(index.byId,id,sources);
  }
  return index;
}

export function findMovieSources(index: MovieSourceIndex, identity: {
  title:string; catalogTitle?:string | undefined; tmdbId?:number | null | undefined;
}): StreamSource[] {
  // Never fall back from an identified movie to an ambiguous, yearless title.
  if (identity.tmdbId) return index.byId.get(identity.tmdbId) || [];
  return index.byTitle.get(movieTitleKey(identity.catalogTitle || identity.title)) || [];
}

/** Route IDs/bookmarks take precedence over year-stripping search aliases. */
export function findCatalogItem(items: Map<string,CatalogItem>, id: string, type?:CatalogItem["type"] | null): CatalogItem | undefined {
  const accepts = (item:CatalogItem | undefined) => item && (!type || item.type===type) ? item : undefined;
  const direct = accepts(items.get(id));
  if (direct) return direct;
  const key = movieTitleKey(id);
  const typed = type ? accepts(items.get(`${type}-${key}`)) : undefined;
  if (typed) return typed;
  const values = [...items.values()];
  const exact = values.find(item=>(!type||item.type===type) &&
    (item.id===id || (item.catalogTitle && movieTitleKey(item.catalogTitle)===key)));
  if (exact) return exact;
  if (/^\d+$/.test(id)) return values.find(item=>(!type||item.type===type)&&item.tmdbId===Number(id));
  const candidates = values.filter(item=>(!type||item.type===type) && movieTitleKey(item.title)===key);
  const ids = new Set(candidates.map(item=>`${item.type}:${item.tmdbId || item.id}`));
  return ids.size===1 ? candidates[0] : undefined;
}

export function selectMovieSearchResult(results: Array<{id:number;title?:string;name?:string;original_title?:string;release_date?:string;first_air_date?:string}>, title:string): number | null {
  const year = movieTitleYear(title), key = movieTitleKey(withoutYear(title));
  const matches = results.filter(result => {
    const titles = [result.title,result.name,result.original_title];
    if (!titles.some(value=>value && movieTitleKey(value)===key)) return false;
    return !year || Number((result.release_date || result.first_air_date || "").slice(0,4))===year;
  });
  return new Set(matches.map(result=>result.id)).size===1 ? matches[0]!.id : null;
}
