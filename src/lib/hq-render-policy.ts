// src/lib/hq-render-policy.ts — CPU/GPU budget for smooth on-device HQ.
export interface HqDeviceInfo {
  width: number;
  height: number;
  mobile: boolean;
  logicalCores: number;
  memoryGb: number;
  webgpu: boolean;
}
export type HqProcessing = "neural" | "webgl" | "native";

/**
 * A GPU video copy and 2× CNN can stall Android's hardware decoder.
 * Neural inference is opt-in and must pass the renderer's live FPS benchmark.
 * Compact mobile inference is restricted to SD; HD+ keeps native decoding.
 */
export function chooseHqProcessing(device: HqDeviceInfo): HqProcessing {
  const {width,height,mobile,logicalCores,memoryGb,webgpu} = device;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 160 || height < 90) return "native";
  if (mobile) {
    if(webgpu && logicalCores>=8 && memoryGb>=4 && width<=854 && height<=480)return "neural";
    if(logicalCores>=6 && memoryGb>=4 && width<=854 && height<=480)return "webgl";
    return "native";
  }
  if (webgpu && logicalCores >= 8 && memoryGb >= 8 && width <= 1280 && height <= 720) return "neural";
  if (logicalCores >= 4 && memoryGb>=4 && width <= 1280 && height <= 720) return "webgl";
  return "native";
}
