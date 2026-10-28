import type { WatchProgress } from "./types";

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignora erros de storage
  }
}

const PROGRESS_KEY = "ydo-progress";
const LIST_KEY = "ydo-list";

export function getProgress(): WatchProgress[] {
  return safeRead<WatchProgress[]>(PROGRESS_KEY, []);
}

export function saveProgress(progress: WatchProgress): void {
  const all = getProgress().filter((p) => p.id !== progress.id);
  safeWrite(PROGRESS_KEY, [progress, ...all].slice(0, 50));
}

export function getProgressById(id: string): WatchProgress | undefined {
  return getProgress().find((p) => p.id === id);
}

export function removeProgress(id: string): void {
  const all = getProgress().filter((p) => p.id !== id);
  safeWrite(PROGRESS_KEY, all);
}

export function clearAllProgress(): void {
  safeWrite(PROGRESS_KEY, []);
}

export function getSavedList(): string[] {
  return safeRead<string[]>(LIST_KEY, []);
}

export function toggleSaved(id: string): boolean {
  const list = getSavedList();
  const has = list.includes(id);
  safeWrite(LIST_KEY, has ? list.filter((i) => i !== id) : [id, ...list]);
  return !has;
}

export function isSaved(id: string): boolean {
  return getSavedList().includes(id);
}
