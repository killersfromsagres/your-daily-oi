/** Bounded source-metadata inspection for the user's existing VOD catalog.
 * Does not download films, decode media, bypass DRM/403, or infer quality from
 * posters. No arbitrary URL endpoint: URLs must originate from catalog sources.
 */
import type {StreamSource} from "./types";
import {qualityFromDimensions,qualityLabelForHeight,type MediaQualityBadgeInfo} from "./verified-media-quality";
import {advertisedVodResolution,rejectedVodSourceReason,shortlistVodSources,playableVodSources} from "./vod-source-quality";

export type QualityEvidence="manifest"|"container"|"declared"|"cam"|"unknown";
export interface SourceQualityFinding extends MediaQualityBadgeInfo{
  evidence:QualityEvidence;
  width?:number;
  height?:number;
  checkedAt:number;
}
const MAX_MANIFEST_BYTES=96*1024;
const MAX_MP4_BYTES=256*1024;
const TIMEOUT_MS=3600;
const DENIED_HOST=/^(?:localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

export function safeVodProbeUrl(raw:string):URL|null{
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.username||url.password||url.port&&!["443"].includes(url.port))return null;
    const host=url.hostname.toLowerCase();
    if(DENIED_HOST.test(host)||host.indexOf(".")<0||host.startsWith("169.254.")||
      host==="0.0.0.0"||host==="255.255.255.255"||host.endsWith(".lan")||
      host.startsWith("127.")||host.startsWith("10.")||host.startsWith("192.168.")||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)||host.includes(":")||
      /^\d+(?:\.\d+){3}$/.test(host))return null;
    if(url.pathname.startsWith("/api/tv/")&&host==="zangflix.lovable.app")return null;
    return url;
  }catch{return null}
}
function estimate(width:number,height:number,evidence:"manifest"|"container",now:number):SourceQualityFinding|null{
  const quality=qualityFromDimensions(width,height);
  if(!quality)return null;
  return {tier:quality.tier,label:quality.label,verified:false,
    detail:evidence==="manifest"?
      "Resolução da variante indicada pelo manifesto de vídeo; a reprodução pode escolher uma qualidade inferior.":
      "Resolução identificada nos metadados do contêiner. Confirmação final ocorre durante a reprodução.",
    evidence,width,height,checkedAt:now};
}
export function parseHlsQuality(text:string,now=Date.now()):SourceQualityFinding|null{
  if(!text.trimStart().startsWith("#EXTM3U"))return null;
  const lines=text.split(/\r?\n/);
  let best:SourceQualityFinding|null=null;
  for(let i=0;i<lines.length;i++){
    if(!/^#EXT-X-(?:STREAM-INF|I-FRAME-STREAM-INF):/i.test(lines[i]||""))continue;
    const match=(lines[i]||"").match(/(?:^|[,:\s])RESOLUTION=(\d{2,5})x(\d{2,5})(?:,|$)/i);
    if(!match)continue;
    const item=estimate(Number(match[1]),Number(match[2]),"manifest",now);
    if(item&&(!best||(item.width||0)*(item.height||0)>(best.width||0)*(best.height||0)))best=item;
  }
  return best;
}
export function parseDashQuality(text:string,now=Date.now()):SourceQualityFinding|null{
  if(!/^\s*(?:<\?xml[^>]*>\s*)?<MPD[\s>]/i.test(text))return null;
  let best:SourceQualityFinding|null=null;
  for(const representation of text.matchAll(/<Representation\b[^>]{0,2400}>/gi)){
    const w=representation[0].match(/\bwidth=["'](\d{2,5})["']/i);
    const h=representation[0].match(/\bheight=["'](\d{2,5})["']/i);
    if(!w||!h)continue;
    const item=estimate(Number(w[1]),Number(h[1]),"manifest",now);
    if(item&&(!best||(item.width||0)*(item.height||0)>(best.width||0)*(best.height||0)))best=item;
  }
  return best;
}
/** MP4 tkhd fixed-point dimensions. A moov atom at the file end cannot be
 * measured from a small leading byte range, so return null (never guess). */
export function parseMp4Quality(data:Uint8Array,now=Date.now()):SourceQualityFinding|null{
  if(data.length<110)return null;
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  let best:SourceQualityFinding|null=null;
  // Search for box headers, but accept tkhd only when size/version/track
  // dimensions are structurally valid. Avoid scanning arbitrarily large bytes.
  for(let i=4;i+105<data.length;i++){
    if(data[i]!==0x74||data[i+1]!==0x6b||data[i+2]!==0x68||data[i+3]!==0x64)continue;
    const start=i-4;
    const size=view.getUint32(start,false);
    if(size<92||size>4096||start+size>data.length)continue;
    const version=data[i+4];
    const position=start+(version===1?96:84);
    if(version!==0&&version!==1)continue;
    if(position+8>start+size)continue;
    const width=view.getUint32(position,false)/65536;
    const height=view.getUint32(position+4,false)/65536;
    const item=estimate(Math.round(width),Math.round(height),"container",now);
    if(item&&(!best||(item.width||0)*(item.height||0)>(best.width||0)*(best.height||0)))best=item;
  }
  return best;
}
export function declaredQuality(source:Pick<StreamSource,"url"|"name"|"quality">,now=Date.now()):SourceQualityFinding|null{
  if(rejectedVodSourceReason(source)==="cinema")return {
    tier:"cam",label:"CAM · CINEMA",detail:"Fonte marcada como gravação de cinema; não é uma medição visual.",
    verified:false,evidence:"cam",checkedAt:now};
  const height=advertisedVodResolution(source);
  const named=height===null?null:qualityLabelForHeight(height);
  if(!named)return null;
  return {...named,
    detail:"Qualidade "+height+"p declarada pelo fornecedor; não confirmada em manifesto ou vídeo.",
    verified:false,evidence:"declared",checkedAt:now};
}
export function bestQualityFinding(items:readonly (SourceQualityFinding|null)[]):SourceQualityFinding|null{
  const candidates=items.filter((v):v is SourceQualityFinding=>!!v);
  const evidenceScore:Record<QualityEvidence,number>={container:4,manifest:3,declared:2,cam:1,unknown:0};
  // Prefer direct container evidence to a questionable promotional tag.
  return candidates.sort((a,b)=>evidenceScore[b.evidence]-evidenceScore[a.evidence]||
    (b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))[0]||null;
}
async function readLimited(response:Response,maxBytes:number):Promise<Uint8Array>{
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let count=0;
  try{
    while(count<maxBytes){
      const part=await reader.read();
      if(part.done)break;
      const room=maxBytes-count;
      const safe=part.value.subarray(0,Math.min(room,part.value.length));
      chunks.push(safe);count+=safe.length;
      if(safe.length<part.value.length)break;
    }
  }finally{void reader.cancel().catch(()=>{});}
  const output=new Uint8Array(count);let at=0;
  for(const part of chunks){output.set(part,at);at+=part.length}
  return output;
}
async function fetchProbe(url:URL,bytes:number,isManifest:boolean,tail=false):Promise<{data:Uint8Array;mime:string}|null>{
  let current=url;
  for(let i=0;i<3;i++){
    const response=await fetch(current.toString(),{
      redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS),
      headers:isManifest?{Accept:"application/vnd.apple.mpegurl,application/dash+xml,text/plain,*/*"}:
        {Range:tail?"bytes=-"+bytes:"bytes=0-"+(bytes-1),Accept:"video/mp4,application/octet-stream,*/*"},
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");await response.body?.cancel().catch(()=>{});
      if(!location)return null;
      const redirected=safeVodProbeUrl(new URL(location,current).toString());
      if(!redirected)return null;
      current=redirected;continue;
    }
    if(!response.ok||response.status===204||(tail&&response.status!==206)){
      await response.body?.cancel().catch(()=>{});return null;
    }
    return {data:await readLimited(response,bytes),mime:response.headers.get("content-type")||""};
  }
  return null;
}
export async function probeExistingVodSources(sources:readonly StreamSource[]):Promise<SourceQualityFinding|null>{
  if(sources.length>0&&sources.every(s=>rejectedVodSourceReason(s)==="cinema")){
    // Never classify a low-bitrate legitimate rip as CAM. This requires
    // explicit capture markers on every available catalog source.
    return declaredQuality(sources[0]!);
  }
  // Check up to four distinct legitimate candidates, not only two.
  // Providers may return an HLS media playlist without RESOLUTION, while an
  // alternative CDN provides a master playlist or an inspectable MP4 header.
  const primary=shortlistVodSources(sources,4);
  const selected=primary.length?primary:playableVodSources(sources).slice(0,4);
  if(!selected.length)return null;
  const inspect=async(source:StreamSource):Promise<SourceQualityFinding|null>=>{
    const advertised=declaredQuality(source);
    const uri=safeVodProbeUrl(source.url);
    if(!uri)return advertised;
    const manifest=/\.m3u8?(?:$|[?])/i.test(uri.pathname+uri.search)||
      /\.mpd(?:$|[?])/i.test(uri.pathname+uri.search)||
      source.format==="hls"||source.format==="dash";
    try{
      const result=await fetchProbe(uri,manifest?MAX_MANIFEST_BYTES:MAX_MP4_BYTES,manifest);
      if(!result||/text\/html/i.test(result.mime))return advertised;
      const header=new TextDecoder().decode(result.data.subarray(0,160));
      const isText=manifest||/mpegurl|dash\+xml|text\/plain/i.test(result.mime)||
        header.startsWith("#EXTM3U")||header.includes("<MPD");
      const parsed=isText?(()=>{
        const text=new TextDecoder().decode(result.data);
        return parseHlsQuality(text)||parseDashQuality(text);
      })():parseMp4Quality(result.data);
      if(parsed)return parsed;
      if(!isText&&/mp4|octet-stream/i.test(result.mime)){
        // Non-faststart MP4 files often put moov/tkhd at the end.
        // A bounded suffix is examined only when the server supports Range.
        const last=await fetchProbe(uri,MAX_MP4_BYTES,false,true);
        const tailParsed=last?parseMp4Quality(last.data):null;
        if(tailParsed)return tailParsed;
      }
      return advertised;
    }catch{return advertised}
  };
  const first=await Promise.all(selected.slice(0,2).map(inspect));
  let best=bestQualityFinding(first);
  if(best?.evidence==="manifest"||best?.evidence==="container")return best;
  if(selected.length>2){
    const others=await Promise.all(selected.slice(2,4).map(inspect));
    best=bestQualityFinding([...first,...others]);
  }
  return best;
}
