// src/lib/live-latency.ts — pure low-latency policy for HLS/MPEG-TS/native live media.
export type LiveLatencyMode = "fast" | "stable";

export function hlsLatencyOptions(mode: LiveLatencyMode) {
  const fast = mode === "fast";
  // Distances are expressed in HLS target durations, never guessed seconds.
  return {
    enableWorker: true,
    lowLatencyMode: true,
    liveSyncDurationCount: fast ? 2 : 3,
    liveMaxLatencyDurationCount: fast ? 6 : 9,
    maxLiveSyncPlaybackRate: fast ? 1.08 : 1.04,
    liveSyncOnStallIncrease: fast ? 0.75 : 1,
    maxBufferLength: fast ? 8 : 18,
    maxMaxBufferLength: fast ? 16 : 35,
    backBufferLength: fast ? 12 : 28,
  };
}

export function mpegtsLatencyOptions(mode: LiveLatencyMode) {
  const fast = mode === "fast";
  return {
    enableStashBuffer: !fast,
    stashInitialSize: fast ? 96 * 1024 : 384 * 1024,
    liveBufferLatencyChasing: true,
    liveBufferLatencyMaxLatency: fast ? 2 : 5,
    liveBufferLatencyMinRemain: fast ? 0.8 : 1.5,
    lazyLoad: false,
    autoCleanupSourceBuffer: true,
    autoCleanupMaxBackwardDuration: fast ? 35 : 60,
    autoCleanupMinBackwardDuration: fast ? 12 : 25,
  };
}

export type LatencyDecision =
  | { action: "none"; behind: number }
  | { action: "seek"; behind: number; position: number }
  | { action: "speed"; behind: number; rate: number };

/**
 * Back-pressure: prefer gentle catch-up; jump only after substantial drift
 * and only within the seekable interval, to avoid under-buffering.
 */
export function decideLiveCatchup(input: {
  edge: number;
  current: number;
  syncPosition?: number | undefined;
  bufferAhead: number;
  stalled: boolean;
  paused: boolean;
  mode: LiveLatencyMode;
  hlsManaged: boolean;
}): LatencyDecision {
  const { edge, current, bufferAhead, stalled, paused, mode, hlsManaged } = input;
  const behind = edge - current;
  if (!Number.isFinite(behind) || behind < 0 || paused || stalled) return { action:"none", behind:Math.max(0,behind || 0) };
  const target = Number.isFinite(input.syncPosition) ? input.syncPosition! : Math.max(0, edge - (mode === "fast" ? 2.5 : 5));
  const drift = target - current;
  if (drift > (mode === "fast" ? 9 : 14) && bufferAhead > 0.35 && target > current + 0.5) {
    return { action:"seek", behind, position:target };
  }
  // hls.js owns playbackRate through its latency controller; do not fight it.
  if (!hlsManaged && drift > (mode === "fast" ? 2 : 4) && bufferAhead >= 1.3) {
    return { action:"speed", behind, rate:mode === "fast" ? 1.06 : 1.03 };
  }
  return { action:"none", behind };
}


/** Some channel streams report HAVE_ENOUGH_DATA without ever advancing time.
 * Detect the silent failure and let the existing direct/proxy/source failover
 * recover rather than showing a permanent frozen first frame.
 */
export type LivePlaybackStall = "startup" | "buffer" | "frozen" | null;
export function classifyLivePlaybackStall(input: {
  elapsedWithoutProgressMs: number;
  currentTime: number;
  readyState: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
}): LivePlaybackStall {
  const { elapsedWithoutProgressMs, currentTime, readyState, paused, ended, seeking } = input;
  if (paused || ended || seeking || !Number.isFinite(elapsedWithoutProgressMs)) return null;
  if (elapsedWithoutProgressMs < 0) return null;
  if (currentTime < 1 && elapsedWithoutProgressMs >= 15_000) return "startup";
  if (readyState < 3 && elapsedWithoutProgressMs >= 25_000) return "buffer";
  if (elapsedWithoutProgressMs >= 35_000) return "frozen";
  return null;
}
