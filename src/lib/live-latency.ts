// src/lib/live-latency.ts — pure low-latency policy for HLS/MPEG-TS/native live media.
export type LiveLatencyMode = "fast" | "stable";

/**
 * Fast mode is opt-in for live sports: a short live-edge buffer and playback
 * speed-up can look like frame dropping on a busy network or low-end TV.
 * An explicit saved preference always wins over the channel default.
 */
export function preferredLiveLatencyMode(
  category: string, channel: string, saved?: string | null,
): LiveLatencyMode {
  if (saved === "fast" || saved === "stable") return saved;
  return /esport|sport|premiere|espn|combate|band\s*sports/i.test(category + " " + channel)
    ? "stable" : "fast";
}

export function hlsLatencyOptions(mode: LiveLatencyMode) {
  const fast = mode === "fast";
  // Durations here use HLS target durations, not measured frame rates.
  return {
    enableWorker: true,
    // Avoid decoding 4K ABR variants inside small player viewports.
    // Fullscreen can still select a matching high-resolution rendition.
    capLevelToPlayerSize: true,
    lowLatencyMode: fast,
    liveSyncDurationCount: fast ? 3 : 4,
    liveMaxLatencyDurationCount: fast ? 8 : 12,
    // Playback-rate acceleration makes fast action look uneven on 50/60 Hz TVs.
    // Stable mode plays at the source's natural cadence.
    maxLiveSyncPlaybackRate: fast ? 1.03 : 1,
    liveSyncOnStallIncrease: fast ? 1 : 2,
    maxBufferLength: fast ? 12 : 24,
    maxMaxBufferLength: fast ? 22 : 38,
    backBufferLength: fast ? 14 : 22,
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
  // Avoid repeated seeks near the live edge; they can cause rebuffering
  // and discontinuous motion while the broadcaster's sports stream is healthy.
  if (drift > (mode === "fast" ? 14 : 30) &&
      bufferAhead >= (mode === "fast" ? 2 : 4) && target > current + 0.5) {
    return { action:"seek", behind, position:target };
  }
  // hls.js owns playbackRate through its latency controller; do not fight it.
  // Only the explicitly selected low-latency mode may accelerate native video.
  if (!hlsManaged && mode === "fast" && drift > 3 && bufferAhead >= 2) {
    return { action:"speed", behind, rate:1.03 };
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

/** Bounded backoff between retries after transient live source failures.
 * Keep retrying (at most once every two minutes) while the tab is visible:
 * sports sources may rotate well after the old three-attempt deadline.
 * The player suppresses this schedule when every provider rejects access.
 */
export function nextLiveAutoRetryDelay(attempts: number, sourceCount: number): number | null {
  const delays = [2000, 6000, 15000, 30000, 60000, 120000] as const;
  if (!Number.isInteger(attempts) || attempts < 0 || sourceCount <= 0) return null;
  return delays[Math.min(attempts, delays.length - 1)];
}
