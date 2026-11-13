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
 * Never activate neural processing on mobile or for HD+ streams.
 * WebGL sharpening runs only at modest source resolutions on desktops.
 */
export function chooseHqProcessing(device: HqDeviceInfo): HqProcessing {
  const {width,height,mobile,logicalCores,memoryGb,webgpu} = device;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 160 || height < 90) return "native";
  if (mobile) return "native";
  if (webgpu && logicalCores >= 12 && memoryGb >= 8 && width <= 640 && height <= 360) return "neural";
  if (logicalCores >= 4 && width <= 1280 && height <= 720) return "webgl";
  return "native";
}
