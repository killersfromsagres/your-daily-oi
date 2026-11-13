// src/lib/hq-playback-policy.ts — readable HQ renderer priority and fallback.
export type HqBackend = "off" | "waiting" | "neural" | "webgl" | "native";

export interface HqPlaybackState {
  requested: boolean;
  neuralActive: boolean;
  neuralUnavailable: boolean;
  webglActive: boolean;
  webglSupported: boolean;
  webglFailed: boolean;
}

/**
 * HQ is a user preference, NOT a GPU feature flag. Hardware/source failures
 * change the rendering backend, never the user's selected HQ setting.
 */
export function selectHqBackend(state: HqPlaybackState): HqBackend {
  if (!state.requested) return "off";
  if (state.neuralActive) return "neural";
  if (state.webglActive && !state.webglFailed) return "webgl";
  if (state.neuralUnavailable && (state.webglFailed || !state.webglSupported)) return "native";
  return "waiting";
}
