import { useEffect, useState } from "react";

type IntroInterval = { start: number; end: number };
type AniSkipResponse = { found?: boolean; results?: Array<{ interval?: { startTime?: number; endTime?: number }; skipType?: string }> };
type JikanResult = { data?: Array<{ mal_id?: number; title?: string; title_english?: string; title_japanese?: string }> };
const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const cache = new Map<string, IntroInterval | null>();

/** Community-sourced opening cues. Never assume that every opening ends at 90s. */
export function useAnimeOpening(title: string | undefined, episode: number, duration?: number) {
  const [interval, setInterval] = useState<IntroInterval | null>(null);
  useEffect(() => {
    const name = title?.trim();
    if (!name || !Number.isInteger(episode) || episode < 1) { setInterval(null); return; }
    const key = normalize(name) + ":" + episode;
    let cancelled = false;
    setInterval(null);
    if (cache.has(key)) { setInterval(cache.get(key) ?? null); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);
    (async () => {
      try {
        const search = await fetch("https://api.jikan.moe/v4/anime?q=" + encodeURIComponent(name) + "&limit=5", { signal: controller.signal });
        if (!search.ok) return;
        const data = await search.json() as JikanResult;
        const match = data.data?.find(item => [item.title, item.title_english, item.title_japanese].some(candidate => candidate && normalize(candidate) === normalize(name)));
        if (!match?.mal_id) return;
        const url = new URL(`https://api.aniskip.com/v2/skip-times/${match.mal_id}/${episode}`);
        url.searchParams.append("types", "op");
        if (duration && duration > 0) url.searchParams.set("episodeLength", String(Math.round(duration)));
        const response = await fetch(url.toString(), { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json() as AniSkipResponse;
        const segments = payload.results?.filter(item => item.skipType === "op" && item.interval);
        const candidate = segments?.[0]?.interval;
        const start = candidate?.startTime;
        const end = candidate?.endTime;
        if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 240) return;
        const result = { start, end };
        cache.set(key, result);
        if (!cancelled) setInterval(result);
      } catch { /* No verified cue: do not offer an inaccurate skip. */ }
      finally { clearTimeout(timer); }
    })();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [title, episode, duration]);
  return interval;
}
