export const LIVE_VOLUME_KEY="zangflix:live-volume";
export function clampVolume(value:unknown,fallback=1):number {
  if(value===null||value===""||value===undefined)return fallback;
  const number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.min(1,number)):fallback;
}
export function stepVolume(current:number,direction:-1|1):number {
  return Math.round(clampVolume(current+direction*.05)*100)/100;
}
