import type {LiveHqMode} from "./automatic-hq";

/**
 * Live TV uses a real trained 2x WebGPU CNN only when its decoded frame size
 * and device budget make real-time inference plausible. The video/ABR engine
 * always remains the clock, audio source and ultimate fallback.
 *
 * On less capable hardware a spatial (FSR1-inspired, NOT AMD FSR1) WebGL2
 * reconstruction shader is used, then native video if GPU sampling is blocked.
 * This decision is made afresh after resolution / source switches.
 */
export interface LiveHqCapabilities {
  width:number;
  height:number;
  mobile:boolean;
  cores:number;
  memoryGb:number;
  reducedMotion:boolean;
  webgpu?:boolean;
  sports?:boolean;
}
export type LiveHqBackend=LiveHqMode;
export function liveHqBackend(device:LiveHqCapabilities):LiveHqBackend {
  const {width,height,mobile,cores,memoryGb,reducedMotion,webgpu,sports}=device;
  if(reducedMotion||!Number.isFinite(width)||!Number.isFinite(height)||
     width<160||height<90||width>1280||height>720)return "native";
  // Genuine 4x is two sequential CNN 2x inference passes; reserve it for
  // genuinely low-resolution sport streams on high-end desktops only.
  if(sports&&!mobile&&webgpu&&cores>=12&&memoryGb>=8&&
     width<=480&&height<=270)return "neural-4x";
  if(webgpu && cores>=8 && memoryGb >= (mobile?4:8) &&
     width<=(mobile?640:960)&&height<=(mobile?360:540))return "neural";
  if(mobile)return cores>=6&&memoryGb>=4&&width<=854&&height<=480
    ?"spatial":"native";
  return cores>=4&&memoryGb>=4?"spatial":"native";
}
export function liveHqFilter(enabled:boolean,enhancedActive:boolean):string {
  // These subtle compositor controls can improve perceived contrast; unlike
  // WebGPU they do not generate missing pixels. Keep original clarity first.
  return enabled&&!enhancedActive?"contrast(1.025) saturate(1.035)":"none";
}
