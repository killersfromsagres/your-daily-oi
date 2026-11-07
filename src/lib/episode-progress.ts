// src/lib/episode-progress.ts — persistent, per-content/season/episode playback ledger.
import { getProgress } from "./storage";

export type EpisodeKind = "s" | "a";
export type EpisodeKey = { type: EpisodeKind; contentId: string; season: number; episode: number };
export type EpisodeRecord = EpisodeKey & {
  currentTime: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
};
export type EpisodeState = "unwatched" | "started" | "watched";
export const EPISODE_PROGRESS_CHANGED = "zangflix:episode-progress-changed";
export const EPISODE_STORAGE_KEY = "zangflix:episode-progress:v2";
const COMPLETE_AT = 0.92;
const MIN_SECONDS = 4;
const MAX_RECORDS = 3000;

function validKey(key: EpisodeKey): boolean {
  return (key.type === "s" || key.type === "a") &&
    typeof key.contentId === "string" && key.contentId.length > 0 && key.contentId.length < 255 &&
    Number.isSafeInteger(key.season) && key.season >= 0 &&
    Number.isSafeInteger(key.episode) && key.episode > 0;
}
export function episodeKey(key: EpisodeKey): string {
  return key.type + ":" + encodeURIComponent(key.contentId) + ":s" + key.season + ":e" + key.episode;
}
function safeTime(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 20 * 3600) : 0;
}
function validRecord(value: unknown): value is EpisodeRecord {
  if (!value || typeof value !== "object") return false;
  const rec = value as EpisodeRecord;
  return validKey(rec) && typeof rec.completed === "boolean" &&
    Number.isFinite(rec.currentTime) && Number.isFinite(rec.duration) &&
    Number.isFinite(rec.updatedAt);
}
function readPersisted(): EpisodeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EPISODE_STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(validRecord) : [];
  } catch { return []; }
}
function writePersisted(records: EpisodeRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EPISODE_STORAGE_KEY, JSON.stringify(
      [...records].sort((a,b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECORDS)
    ));
    window.dispatchEvent(new Event(EPISODE_PROGRESS_CHANGED));
  } catch { /* storage may be disabled, e.g. private mode */ }
}
function legacyFor(key: EpisodeKey): EpisodeRecord | null {
  if (typeof window === "undefined") return null;
  const p = getProgress().find(item =>
    item.type === key.type &&
    (item.contentId === key.contentId || item.id.startsWith(key.contentId + "-")) &&
    item.season === key.season && item.episode === key.episode
  );
  if (!p) return null;
  const duration = safeTime(p.duration || 0), time = safeTime(p.currentTime || 0);
  const completed = duration > 0 && duration - time < 60 && time / duration >= COMPLETE_AT;
  return {...key, duration, currentTime:time, completed, updatedAt:p.updatedAt};
}
export function getEpisodeProgress(key: EpisodeKey): EpisodeRecord | null {
  if (!validKey(key) || typeof window === "undefined") return null;
  return readPersisted().find(item => episodeKey(item) === episodeKey(key)) || legacyFor(key);
}
export function getEpisodeStatus(record: EpisodeRecord | null): EpisodeState {
  if (record?.completed) return "watched";
  return record && record.currentTime >= MIN_SECONDS ? "started" : "unwatched";
}
export function getEpisodePercentage(record: EpisodeRecord | null): number | null {
  if (!record) return null;
  if (record.completed) return 100;
  if (!record.duration || record.duration <= 0) return null;
  return Math.min(99, Math.max(0, Math.round(record.currentTime / record.duration * 100)));
}
export function saveEpisodeProgress(
  key: EpisodeKey, currentTime: number, duration: number, forceCompleted = false,
): EpisodeRecord | null {
  if (!validKey(key) || typeof window === "undefined") return null;
  const previous = getEpisodeProgress(key);
  const safeDuration = safeTime(duration), time = safeTime(currentTime);
  if (time < MIN_SECONDS && !forceCompleted) return previous;
  // A custom completed flag survives replaying the episode; this also allows
  // users to mark a programme watched without loading its stream.
  const completed = forceCompleted || Boolean(previous?.completed) ||
    (safeDuration > MIN_SECONDS * 3 && time / safeDuration >= COMPLETE_AT);
  const record: EpisodeRecord = {
    ...key, currentTime: completed ? safeDuration || time : time,
    duration: safeDuration, completed, updatedAt: Date.now(),
  };
  const records = readPersisted().filter(item => episodeKey(item) !== episodeKey(key));
  writePersisted([record,...records]);
  return record;
}
export function setEpisodeWatched(key: EpisodeKey, watched: boolean): EpisodeRecord | null {
  if (!validKey(key) || typeof window === "undefined") return null;
  const previous = getEpisodeProgress(key);
  const record: EpisodeRecord = {
    ...key, currentTime: watched ? (previous?.duration || previous?.currentTime || 0) : 0,
    duration: previous?.duration || 0, completed: watched, updatedAt: Date.now(),
  };
  writePersisted([record,...readPersisted().filter(item => episodeKey(item) !== episodeKey(key))]);
  return record;
}
export function countWatchedEpisodes(type: EpisodeKind, contentId: string): number {
  return readPersisted().filter(rec => rec.type === type && rec.contentId === contentId && rec.completed).length;
}
