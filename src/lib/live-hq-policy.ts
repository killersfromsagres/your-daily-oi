/**
 * TV HQ is a voluntary enhancement, independent from the low-latency live
 * clock. Prefer native high-bitrate HLS renditions when available; attempt the
 * existing lightweight WebGL shader ONLY when device and source are capable.
 * This is NOT guaranteed AI 4K upscaling; DRM/cross-origin video can block
 * GPU frame access and should remain on the native video with gentle tuning.
 */
export interface LiveHqCapabilities {
  width:number;
  height:number;
  mobile:boolean;
  cores:number;
  memoryGb:number;
  reducedMotion:boolean;
}
export type LiveHqBackend="native"|"webgl";
export function liveHqBackend(device:LiveHqCapabilities):LiveHqBackend {
  const {width,height,mobile,cores,memoryGb,reducedMotion}=device;
  if(reducedMotion || !Number.isFinite(width)||!Number.isFinite(height)||
     width<160||height<90||width>1280||height>720)return "native";
  if(mobile)return cores>=8&&memoryGb>=4&&width<=854&&height<=480
    ?"webgl":"native";
  return cores>=4&&memoryGb>=4?"webgl":"native";
}
export function liveHqFilter(enabled:boolean,webglActive:boolean):string {
  return enabled&&!webglActive?"contrast(1.025) saturate(1.035)":"none";
}
