/**
 * HQ is enabled by default across live TV, movies, series and anime.
 * Respect an explicit "false" choice from the viewer. Every renderer can
 * still fall back to the original hardware-decoded video when WebGPU/WebGL
 * or the source's cross-origin/DRM policy prevents safe frame processing.
 */
export function automaticHqEnabled(value:string|null|undefined):boolean {
  return value!=="false";
}
export type LiveHqMode="neural"|"spatial"|"native";
export type LiveHqStatus="ai-2x"|"spatial"|"native"|"off";
export function visibleLiveHqStatus(input:{
  enabled:boolean;neuralActive:boolean;spatialActive:boolean;
}):LiveHqStatus {
  if(!input.enabled)return "off";
  if(input.neuralActive)return "ai-2x";
  if(input.spatialActive)return "spatial";
  return "native";
}
