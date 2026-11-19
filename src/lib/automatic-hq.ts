/**
 * HQ is enabled by default across live TV, movies, series and anime.
 * Respect an explicit "false" choice from the viewer. Every renderer can
 * still fall back to the original hardware-decoded video when WebGPU/WebGL
 * or the source's cross-origin/DRM policy prevents safe frame processing.
 */
export function automaticHqEnabled(value:string|null|undefined):boolean {
  return value!=="false";
}
export type LiveHqMode="neural-4x"|"neural"|"spatial"|"native";
export type LiveHqStatus="ai-4x"|"ai-2x"|"spatial"|"deinterlace"|"native"|"off";
export function visibleLiveHqStatus(input:{
  enabled:boolean;neuralActive:boolean;spatialActive:boolean;
  neural4xActive?:boolean;deinterlaceActive?:boolean;
}):LiveHqStatus {
  if(!input.enabled)return "off";
  if(input.neural4xActive)return "ai-4x";
  if(input.neuralActive)return "ai-2x";
  if(input.spatialActive)return "spatial";
  if(input.deinterlaceActive)return "deinterlace";
  return "native";
}
