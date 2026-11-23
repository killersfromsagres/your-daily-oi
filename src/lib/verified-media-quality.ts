/** Truthful VOD quality labels.
 * Movie titles, posters, device screen size, HQ filters and advertised source
 * names do not establish the real encoded resolution. Only the active HTML
 * video element reports the decoded frame dimensions.
 */
import type {CatalogItem,StreamSource} from "./types";
import {advertisedVodResolution,rejectedVodSourceReason} from "./vod-source-quality";

export type MediaKind="f"|"s"|"a";
export type QualityTier="4k"|"qhd"|"fullhd"|"hdplus"|"hd"|"sd"|"low"|"unknown"|"cam";
export interface VerifiedMediaQuality{
  tier:Exclude<QualityTier,"unknown"|"cam">;
  label:string;
  width:number;
  height:number;
  /** Unix milliseconds when a real playable source was measured. */
  observedAt:number;
  /** A non-reversible local fingerprint; do not persist signed stream URLs. */
  sourceFingerprint:string;
}
export interface MediaQualityBadgeInfo{
  label:string;
  detail:string;
  tier:QualityTier;
  verified:boolean;
}
export interface MediaQualityKey{
  type:MediaKind;
  id:string;
  season?:number|undefined;
  episode?:number|undefined;
}
const STORAGE="zangflix:verified-video-resolution:v1";
export const QUALITY_CHANGED_EVENT="zangflix:quality-measured";
const MAX_ENTRIES=350;
const MAX_AGE_MS=7*24*60*60*1000;

export function qualityKey(input:MediaQualityKey):string{
  const base=input.type+":"+input.id;
  return input.type==="f"?base:
    Number.isSafeInteger(input.season)&&Number.isSafeInteger(input.episode)
      ?base+":t"+input.season+":e"+input.episode
      :base+":last";
}

/** Consistent public badges for decoded frames, source manifests, and provider claims.
 * Resolution is retained in detail/tooltip; no arbitrary 816p in the button.
 * Full HD+ represents QHD and other >1080p non-4K rasters, not exact 1080p. */
export function qualityLabelForHeight(height:number):{tier:Exclude<QualityTier,"unknown"|"cam">;label:string}|null{
  if(!Number.isFinite(height)||height<100||height>8000)return null;
  if(height>=2160)return {tier:"4k",label:"4K UHD"};
  if(height>1080)return {tier:"qhd",label:"FULL HD+"};
  if(height>=1080)return {tier:"fullhd",label:"FULL HD"};
  if(height>=800)return {tier:"hdplus",label:"HD+"};
  if(height>=720)return {tier:"hd",label:"HD"};
  if(height>=480)return {tier:"sd",label:"SD"};
  return {tier:"low",label:"BAIXA"};
}
/** Do not promote an ultrawide 1920×800 source to Full HD by width alone. */
export function qualityFromDimensions(width:number,height:number):Pick<VerifiedMediaQuality,"tier"|"label"|"width"|"height">|null{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<128||height<100||width>10000||height>8000)return null;
  const longSide=Math.max(width,height);
  const shortSide=Math.min(width,height);
  // 3840×1600 is a genuine cropped UHD movie; 1920×800 remains HD+.
  const fourK=longSide>=3800&&shortSide>=1600;
  const named=qualityLabelForHeight(fourK?2160:Math.min(shortSide,2159));
  if(!named)return null;
  return {...named,width,height};
}
export interface QualityBadgePalette{color:string;background:string;border:string}
/** Fully opaque background for readable badges even on bright film artwork.
 * The individual tier colors remain progressively distinct while text
 * contrast stays high. Do not add backdrop-filter (expensive on mobile). */
export function qualityBadgePalette(tier:QualityTier):QualityBadgePalette{
  switch(tier){
    case "4k":return {color:"#fff1bd",background:"#50330d",border:"#f5c45d"};
    case "qhd":return {color:"#f2ddff",background:"#492467",border:"#cc9ef2"};
    case "fullhd":return {color:"#ece2ff",background:"#35215b",border:"#b99df2"};
    case "hdplus":return {color:"#b9fff8",background:"#124c54",border:"#66d9df"};
    case "hd":return {color:"#d7efff",background:"#173f70",border:"#8bc5f9"};
    case "sd":return {color:"#f0f1f5",background:"#363c49",border:"#9da6b7"};
    case "low":return {color:"#ffe0d5",background:"#58372c",border:"#d4a28d"};
    case "cam":return {color:"#ffdad8",background:"#67252a",border:"#f19b9c"};
    default:return {color:"#f0f3f9",background:"#303743",border:"#aeb8ca"};
  }
}
export function tierFromQualityLabel(label:string):QualityTier{
  const value=label.toUpperCase();
  if(/CAM|CINEMA/.test(value))return "cam";
  if(/4K|UHD|2160P/.test(value))return "4k";
  if(/QHD|1440P|FULL HD\+/.test(value))return "qhd";
  if(/FULL HD|1080P/.test(value))return "fullhd";
  if(/HD\+|80\dP|8[1-9]\dP|9\d\dP|10[0-7]\dP/.test(value))return "hdplus";
  if(/720P|\bHD\b/.test(value))return "hd";
  if(/SD|480P/.test(value))return "sd";
  if(/BAIXA|360P|240P/.test(value))return "low";
  return "unknown";
}

export function sourceFingerprint(url:string):string{
  // Fast deterministic hash, not security-sensitive; never store the original
  // signed URL (which may contain access tokens). Scoped to the current browser.
  let h=2166136261;
  for(let i=0;i<url.length;i++)h=Math.imul(h^url.charCodeAt(i),16777619);
  return (h>>>0).toString(36);
}
type RecordMap=Record<string,VerifiedMediaQuality>;
function validRecord(v:unknown,now:number):v is VerifiedMediaQuality{
  if(!v||typeof v!=="object")return false;
  const r=v as Partial<VerifiedMediaQuality>;
  return typeof r.label==="string"&&typeof r.tier==="string"&&
    typeof r.sourceFingerprint==="string"&&typeof r.width==="number"&&
    typeof r.height==="number"&&typeof r.observedAt==="number"&&
    now-r.observedAt<=MAX_AGE_MS&&r.observedAt<=now+60000&&
    qualityFromDimensions(r.width,r.height)!==null;
}
function readAll(storage:Pick<Storage,"getItem">,now=Date.now()):RecordMap{
  try{
    const raw=storage.getItem(STORAGE);
    if(!raw||raw.length>100_000)return {};
    const input:unknown=JSON.parse(raw);
    if(!input||typeof input!=="object"||Array.isArray(input))return {};
    return Object.fromEntries(Object.entries(input).flatMap(([key,rec])=>{
      if(key.length>=260||!validRecord(rec,now))return [];
      const actual=qualityFromDimensions(rec.width,rec.height);
      // Migrate legacy cached "HD 800p" and "FULL HD 1080p" records.
      // Never let a stale label overwrite an actual measured resolution.
      return actual?[[key,{...rec,...actual}]]:[];
    })) as RecordMap;
  }catch{return {}}
}
export function readVerifiedMediaQuality(key:MediaQualityKey,storage?:Pick<Storage,"getItem">):VerifiedMediaQuality|null{
  const store=storage??(typeof window!=="undefined"?window.localStorage:undefined);
  if(!store)return null;
  const all=readAll(store);
  return all[qualityKey(key)]??null;
}
export function writeVerifiedMediaQuality(key:MediaQualityKey,sourceUrl:string,width:number,height:number,
  storage?:Pick<Storage,"getItem"|"setItem">,now=Date.now()):VerifiedMediaQuality|null{
  const resolution=qualityFromDimensions(width,height);
  if(!resolution||!sourceUrl||!key.id)return null;
  const store=storage??(typeof window!=="undefined"?window.localStorage:undefined);
  if(!store)return null;
  const item:VerifiedMediaQuality={...resolution,observedAt:now,sourceFingerprint:sourceFingerprint(sourceUrl)};
  try{
    const entries=readAll(store,now);
    entries[qualityKey(key)]=item;
    if(key.type!=="f")entries[qualityKey({type:key.type,id:key.id})]=item;
    const sorted=Object.entries(entries).sort((a,b)=>b[1].observedAt-a[1].observedAt)
      .slice(0,MAX_ENTRIES);
    store.setItem(STORAGE,JSON.stringify(Object.fromEntries(sorted)));
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(QUALITY_CHANGED_EVENT,{
      detail:{type:key.type,id:key.id},
    }));
    return item;
  }catch{return null}
}
/** A CAM label requires explicit evidence in source metadata, not the film year,
 * low resolution alone, an MPEG-TS extension, or pixelation on the screen. */
export function camCaptureEvidence(sources:readonly Pick<StreamSource,"url"|"quality"|"name">[]):boolean{
  return sources.length>0 && sources.every(source=>rejectedVodSourceReason(source)==="cinema");
}
export function describeMediaQuality(
  sources:readonly Pick<StreamSource,"url"|"quality"|"name">[],
  measured:VerifiedMediaQuality|null,
  opts:{seriesAggregate?:boolean;remote?:MediaQualityBadgeInfo|null}={},
):MediaQualityBadgeInfo{
  if(measured){
    return {tier:measured.tier,label:measured.label,verified:true,
      detail:(opts.seriesAggregate?"Último episódio reproduzido: ":"Resolução realmente medida: ")+
        measured.width+"×"+measured.height+". Última verificação; pode variar conforme a fonte e a reprodução."};
  }
  if(opts.remote&&opts.remote.tier!=="unknown"){
    // Manifest/container describe the source, not an already-decoded frame.
    return {...opts.remote,verified:false};
  }
  if(camCaptureEvidence(sources))return {tier:"cam",label:"CAM · CINEMA",verified:false,
    detail:"A fonte foi identificada como gravação de cinema pela descrição ou pelo arquivo. Qualidade baixa; fonte bloqueada para reprodução."};
  // Do not pretend a provider claim is an observed resolution. Still show it
  // explicitly so fresh visitors aren't left with every title as unknown.
  const heights=sources.filter(s=>!rejectedVodSourceReason(s))
    .map(advertisedVodResolution).filter((v):v is number=>v!==null);
  const height=heights.length?Math.max(...heights):null;
  const named=height!==null?qualityLabelForHeight(height):null;
  if(named){
    return {...named,label:named.label,verified:false,
      detail:"Resolução "+height+"p declarada pelo fornecedor (não verificada). A medição real substituirá este selo durante a reprodução."};
  }
  return {tier:"unknown",label:"A VERIFICAR",verified:false,
    detail:opts.seriesAggregate?"A resolução varia por episódio e fonte. O catálogo será consultado em busca de metadados.":
      "Sem informação confiável da fonte. O catálogo será consultado e o vídeo medido ao reproduzir."};
}
export function qualityForCatalogItem(item:Pick<CatalogItem,"type"|"id"|"streams">,
  measured:VerifiedMediaQuality|null):MediaQualityBadgeInfo{
  return describeMediaQuality(item.type==="f"?item.streams:[],measured,
    {seriesAggregate:item.type!=="f"});
}
