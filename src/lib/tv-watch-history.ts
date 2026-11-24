import { getEpisodeProgress, episodeProgressSnapshot, getEpisodeStatus, type EpisodeRecord } from "./episode-progress";
import { getProgress } from "./storage";
import type { CatalogItem, EpisodeItem, WatchProgress } from "./types";

export function tvSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  try { return /ZangFlixTV\//i.test(navigator.userAgent) ||
    ["webos","tizen"].includes(sessionStorage.getItem("zf-installed-tv-app")||"") ||
    sessionStorage.getItem("zf-dedicated-tv") === "1"; } catch { return /ZangFlixTV\//i.test(navigator.userAgent); }
}
export function tvRememberSession() {
  try { sessionStorage.setItem("zf-dedicated-tv","1"); } catch {}
}
export function tvEpisodeRecords(item: CatalogItem): Map<string, EpisodeRecord> {
  if(item.type==="f")return new Map<string,EpisodeRecord>();
  return episodeProgressSnapshot(item.type,item.id);
}
export function tvNextEpisode(item: CatalogItem, records: Map<string, EpisodeRecord>): EpisodeItem | undefined {
  const episodes=(item.seasons||[]).flatMap(s=>s.episodes).sort((a,b)=>a.seasonNumber-b.seasonNumber||a.episodeNumber-b.episodeNumber);
  const latest=episodes.filter(ep=>getEpisodeStatus(records.get(ep.seasonNumber+":"+ep.episodeNumber)||null)!=="unwatched")
    .sort((a,b)=>(records.get(b.seasonNumber+":"+b.episodeNumber)?.updatedAt||0)-(records.get(a.seasonNumber+":"+a.episodeNumber)?.updatedAt||0))[0];
  if(!latest) return episodes[0];
  const rec=records.get(latest.seasonNumber+":"+latest.episodeNumber);
  if(!rec?.completed) return latest;
  return episodes.slice(episodes.indexOf(latest)+1).find(ep=>!records.get(ep.seasonNumber+":"+ep.episodeNumber)?.completed) ||
    episodes.find(ep=>!records.get(ep.seasonNumber+":"+ep.episodeNumber)?.completed) || episodes[0];
}
export function tvHistory(progress: WatchProgress[], onlyActive=true): WatchProgress[] {
  const result:WatchProgress[]=[];const seen=new Set<string>();
  for(const p of [...progress].sort((a,b)=>b.updatedAt-a.updatedAt)){
    if(!p||p.currentTime<4)continue;
    const id=p.contentId||p.id;const key=p.type+":"+id;if(seen.has(key))continue;seen.add(key);
    const ep=p.type!=="f"&&p.season!=null&&p.episode!=null?getEpisodeProgress({type:p.type,contentId:id,season:p.season,episode:p.episode}):null;
    const complete=ep?ep.completed:!!(p.duration&&p.currentTime/p.duration>=.92);
    if(onlyActive&&complete&&p.type==="f")continue;
    const duration=ep?.duration||p.duration;
    result.push({...p,contentId:id,currentTime:ep?.currentTime??p.currentTime,...(duration!==undefined?{duration}:{})});
  }
  return result.slice(0,24);
}
export function tvReadHistory(){return getProgress();}
export function tvPercent(p:{currentTime:number;duration?:number}):number {
  return p.duration&&p.duration>0?Math.max(0,Math.min(100,Math.round(p.currentTime/p.duration*100))):0;
}
export function tvTime(seconds:number):string {
  const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;
  return h?h+"h "+String(m).padStart(2,"0")+"min":m+"min "+String(s).padStart(2,"0")+"s";
}
