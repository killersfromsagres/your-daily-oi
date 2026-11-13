import { normalizeHeroTitle } from "./hero-rotation";

/** One campaign only: 13 November 2026, America/Sao_Paulo (UTC-03). */
export const FRIDAY13_START = Date.parse("2026-11-13T00:00:00-03:00");
export const FRIDAY13_END = Date.parse("2026-11-14T00:00:00-03:00");
export function isFriday13EditionActive(now = Date.now()): boolean {
  return Number.isFinite(now) && now >= FRIDAY13_START && now < FRIDAY13_END;
}
export function friday13NextBoundary(now: number): number | null {
  if (!Number.isFinite(now)) return null;
  if (now < FRIDAY13_START) return FRIDAY13_START;
  return now < FRIDAY13_END ? FRIDAY13_END : null;
}

type Candidate = { id:string; type:string; title:string; tmdbId?:number|null };
const PRIORITY = [13207,4488,10225,9730,9725,9728,9731,10281,10283,10285];
const KNOWN_IDS = new Set(PRIORITY);
export function isFriday13Movie(item: Candidate): boolean {
  if (item.type !== "f") return false;
  if (item.tmdbId && KNOWN_IDS.has(item.tmdbId)) return true;
  const title = normalizeHeroTitle(item.title);
  // Anchored matching excludes parody films, documentaries and unrelated Fridays.
  return /^(sexta feira 13|friday the 13th)(?: |$)/.test(title) ||
    /^(jason x|jason vai para o inferno|jason goes to hell|freddy (?:vs|versus|x) jason)(?: |$)/.test(title);
}
export function selectFriday13Movies<T extends Candidate>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (!isFriday13Movie(item)) return false;
    const key = item.tmdbId ? "tmdb:"+item.tmdbId : "id:"+item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => {
    const rank = (item:T) => {
      const index = PRIORITY.indexOf(item.tmdbId ?? 0);
      return index < 0 ? PRIORITY.length : index;
    };
    return rank(a)-rank(b);
  });
}
