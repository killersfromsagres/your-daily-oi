// src/lib/live-latency.ts — pure low-latency policy for HLS/MPEG-TS/native live media.
export type LiveLatencyMode = "fast" | "stable";

/**
 * Always-on adaptive low latency for live television: minimal server-side
 * buffer with very small catch-up speed changes, separate from the video HQ
 * renderer. The viewer can still choose the fluid buffer mode explicitly.
 * The upstream encoder/segment duration remains an unavoidable lower bound.
 */
export function preferredLiveLatencyMode(
  category: string, channel: string, saved?: string | null,
): LiveLatencyMode {
  if (saved === "fast" || saved === "stable") return saved;
  // Default every live TV channel to automatic low-latency correction.
  // Explicit stable mode remains available for unstable connections.
  return "fast";
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
    liveSyncDurationCount: fast ? 2 : 4,
    liveMaxLatencyDurationCount: fast ? 7 : 12,
    // Playback-rate acceleration makes fast action look uneven on 50/60 Hz TVs.
    // Stable mode plays at the source's natural cadence.
    maxLiveSyncPlaybackRate: fast ? 1.025 : 1,
    liveSyncOnStallIncrease: fast ? 2 : 2,
    maxBufferLength: fast ? 10 : 24,
    capLevelOnFPSDrop: true,
    fpsDroppedMonitoringPeriod: 6000,
    fpsDroppedMonitoringThreshold: 0.12,
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
  if (drift > (mode === "fast" ? 22 : 30) &&
      bufferAhead >= (mode === "fast" ? 2.5 : 4) && target > current + 0.5) {
    return { action:"seek", behind, position:target };
  }
  // hls.js owns playbackRate through its latency controller; do not fight it.
  // Only the explicitly selected low-latency mode may accelerate native video.
  // A gentle 1–2.5% speed-up is generally less visible than repeated seeks;
  // only accelerate native Safari playback with enough forward buffer.
  if (!hlsManaged && mode === "fast" && drift > 1.4 && bufferAhead >= 2) {
    return { action:"speed", behind, rate:drift > 6 ? 1.025 : 1.0125 };
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
  return delays[Math.min(attempts, delays.length - 1)] ?? 120000;
}

/** Hardware decoder safety: a stream that drops a material fraction of its
 * decoded frames must not also be accelerated by the live-edge controller. */
export function shouldEaseLiveCatchup(input: {
  droppedDelta:number;totalDelta:number;bufferAhead:number;
}):boolean{
  if(input.bufferAhead<1.5)return true;
  return input.totalDelta>=20 &&
    input.droppedDelta/Math.max(1,input.totalDelta)>0.085;
}
