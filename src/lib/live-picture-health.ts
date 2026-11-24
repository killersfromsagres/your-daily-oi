/** Picture watchdog; no frame data leaves the browser. */
export type PictureSample="black"|"visible"|"unknown";
export type PictureFault="black-picture"|"missing-frames";
export function classifyPicture(pixels:ArrayLike<number>):PictureSample {
 if(pixels.length<16||pixels.length%4!==0)return "unknown";
 let bright=0,sum=0,opaque=0,max=0;
 for(let i=0;i<pixels.length;i+=4){
  if((pixels[i+3]??0)<240)continue;
  const v=Math.max(pixels[i]??0,pixels[i+1]??0,pixels[i+2]??0);
  opaque++;sum+=v;max=Math.max(max,v);if(v>18)bright++;
 }
 if(opaque<pixels.length/4*.95)return "unknown";
 return max<=28&&bright/opaque<.005&&sum/opaque<=8?"black":"visible";
}
export interface PictureObservation {now:number;mediaTime:number;active:boolean;dimensions:boolean;frameCounter:number|null;picture:PictureSample}
export function createPictureWatchdog(){
 let previous:PictureObservation|null=null,blackSince:number|null=null,missingSince:number|null=null;
 let blackSamples=0,missingSamples=0;
 const reset=()=>{previous=null;blackSince=null;missingSince=null;blackSamples=0;missingSamples=0;};
 return {reset,observe(input:PictureObservation):PictureFault|null{
  if(!input.active||!Number.isFinite(input.mediaTime)){reset();return null;}
  const old=previous;previous=input;
  if(!old||input.now-old.now>5000||input.now<=old.now||input.mediaTime-old.mediaTime<.15||input.mediaTime-old.mediaTime>8){blackSince=null;missingSince=null;blackSamples=0;missingSamples=0;return null;}
  const missing=!input.dimensions||(input.frameCounter!==null&&old.frameCounter!==null&&input.frameCounter<=old.frameCounter);
  if(missing){missingSince??=old.now;missingSamples++;}else{missingSince=null;missingSamples=0;}
  if(input.picture==="black"&&input.dimensions){blackSince??=old.now;blackSamples++;}else{blackSince=null;blackSamples=0;}
  if(missingSince!==null&&missingSamples>=4&&input.now-missingSince>=8000)return "missing-frames";
  if(blackSince!==null&&blackSamples>=6&&input.now-blackSince>=12000)return "black-picture";
  return null;
 }};
}
export function nextPictureSource<T extends {url:string}>(sources:readonly T[],current:number,tried:ReadonlySet<string>,denied:ReadonlySet<string>):number|null{
 for(let step=1;step<sources.length;step++){const i=(current+step)%sources.length;const source=sources[i];if(source&&!tried.has(source.url)&&!denied.has(source.url))return i;}
 return null;
}
const preferred=new Map<string,{fingerprint:string;expires:number}>();
export function rememberPictureSource(channel:string,fingerprint:string,now=Date.now()){
 preferred.delete(channel);preferred.set(channel,{fingerprint,expires:now+30*60_000});
 while(preferred.size>100)preferred.delete(preferred.keys().next().value!);
}
export function forgetPictureSource(channel:string,fingerprint:string){if(preferred.get(channel)?.fingerprint===fingerprint)preferred.delete(channel);}
export function prioritizePictureSource<T>(channel:string,sources:readonly T[],fingerprint:(source:T)=>string,now=Date.now()):T[]{
 const entry=preferred.get(channel);if(!entry||entry.expires<=now){preferred.delete(channel);return [...sources];}
 const i=sources.findIndex(s=>fingerprint(s)===entry.fingerprint);
 return i>0?[sources[i]!,...sources.slice(0,i),...sources.slice(i+1)]:[...sources];
}
