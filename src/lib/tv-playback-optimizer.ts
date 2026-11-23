/** Lightweight TCL/Google TV playback policies.
 * Uses decoder/ABR and HLS live-edge telemetry; there is no DLSS engine in
 * Android WebView, so never advertise neural super-resolution or zero delay.
 */
import {decideLiveCatchup,type LatencyDecision} from "./live-latency";

export interface TvQualityWindow{
  droppedDelta:number;
  decodedDelta:number;
  bufferAhead:number;
  currentLevel:number;
  previousCap:number;
  stableWindows:number;
  maximumLevel:number;
}
export type TvQualityAdjustment={cap:number;stableWindows:number;reason:"stable"|"protect"|"recover"};
export function adjustTvQuality(input:TvQualityWindow):TvQualityAdjustment{
  const {droppedDelta,decodedDelta,bufferAhead,currentLevel,previousCap,stableWindows,maximumLevel}=input;
  const cap=Number.isInteger(previousCap)?previousCap:-1;
  const decoded=Math.max(0,decodedDelta);
  const drop=Math.max(0,droppedDelta);
  const struggling=(decoded>=24&&drop/Math.max(1,decoded)>0.11) || bufferAhead<0.6;
  if(struggling){
    const runningLevel=cap>=0?Math.min(currentLevel,cap):currentLevel;
    if(runningLevel>0)return {cap:runningLevel-1,stableWindows:0,reason:"protect"};
    return {cap:0,stableWindows:0,reason:"protect"};
  }
  if(cap<0)return {cap:-1,stableWindows:0,reason:"stable"};
  if(bufferAhead<2.5||decoded<24)return {cap,stableWindows:0,reason:"stable"};
  const windows=Math.min(5,stableWindows+1);
  // Hysteresis: 5 stable windows (~30 seconds), then one extra ABR level.
  if(windows<5)return {cap,stableWindows:windows,reason:"stable"};
  const next=cap+1;
  return {cap:next>=maximumLevel?-1:next,stableWindows:0,reason:"recover"};
}
export interface TvLatencySample{
  seekableEnd:number;
  currentTime:number;
  bufferAhead:number;
  paused:boolean;
  stalled:boolean;
  decoderStruggling:boolean;
  hlsManaged:boolean;
  syncPosition?:number;
}
export function tvCatchupAction(data:TvLatencySample):LatencyDecision{
  if(data.decoderStruggling||data.bufferAhead<1.8)
    return {action:"none",behind:Math.max(0,data.seekableEnd-data.currentTime)};
  return decideLiveCatchup({
    edge:data.seekableEnd,current:data.currentTime,bufferAhead:data.bufferAhead,
    paused:data.paused,stalled:data.stalled,mode:"fast",
    hlsManaged:data.hlsManaged,
    ...(Number.isFinite(data.syncPosition)?{syncPosition:data.syncPosition}:{}),
  });
}
export function tvBufferedSeconds(video:Pick<HTMLVideoElement,"buffered"|"currentTime">):number{
  try{
    for(let i=0;i<video.buffered.length;i++){
      if(video.buffered.start(i)<=video.currentTime+0.05&&video.buffered.end(i)>video.currentTime)
        return Math.max(0,video.buffered.end(i)-video.currentTime);
    }
  }catch{/* WebView media element may invalidate ranges during ABR transitions */}
  return 0;
}
export function tvSeekableEnd(video:Pick<HTMLVideoElement,"seekable">):number|null{
  try{const ranges=video.seekable;return ranges.length?ranges.end(ranges.length-1):null}
  catch{return null}
}
