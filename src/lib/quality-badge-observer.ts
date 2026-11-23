/** Catalog-wide shared observers.
 * Do not create one IntersectionObserver and two window listeners per
 * film, series and episode badge. Server rendering never touches DOM.
 */
import {QUALITY_CHANGED_EVENT,type MediaQualityKey} from "./verified-media-quality";

type QualityCallback={key:MediaQualityKey;refresh:()=>void};
const callbacks=new Set<QualityCallback>();
const viewportCallbacks=new Map<Element,()=>void>();
let nearObserver:IntersectionObserver|null=null;
let listening=false;

function onQualityMeasured(event:Event){
  const message=(event as CustomEvent<{type?:string;id?:string}>).detail;
  if(!message?.type||!message?.id)return;
  for(const entry of callbacks){
    if(entry.key.type===message.type&&entry.key.id===message.id)
      entry.refresh();
  }
}
function onStorageChanged(event:StorageEvent){
  if(event.key!=="zangflix:verified-video-resolution:v1"&&event.key!==null)return;
  for(const entry of callbacks)entry.refresh();
}
export function subscribeQualityBadgeUpdates(key:MediaQualityKey,refresh:()=>void):()=>void{
  if(typeof window==="undefined")return ()=>{};
  const entry={key,refresh};
  callbacks.add(entry);
  if(!listening){
    window.addEventListener(QUALITY_CHANGED_EVENT,onQualityMeasured);
    window.addEventListener("storage",onStorageChanged);
    listening=true;
  }
  return ()=>{
    callbacks.delete(entry);
    if(!callbacks.size&&listening){
      window.removeEventListener(QUALITY_CHANGED_EVENT,onQualityMeasured);
      window.removeEventListener("storage",onStorageChanged);
      listening=false;
    }
  };
}
function releaseNearObserver(){
  if(viewportCallbacks.size||!nearObserver)return;
  nearObserver.disconnect();
  nearObserver=null;
}
export function observeQualityBadge(node:Element,onNear:()=>void):()=>void{
  if(typeof IntersectionObserver==="undefined"){onNear();return ()=>{};}
  if(!nearObserver){
    nearObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const callback=viewportCallbacks.get(entry.target);
        if(!callback)continue;
        viewportCallbacks.delete(entry.target);
        nearObserver?.unobserve(entry.target);
        callback();
      }
      releaseNearObserver();
    },{rootMargin:"200px"});
  }
  viewportCallbacks.set(node,onNear);
  nearObserver.observe(node);
  return ()=>{
    if(viewportCallbacks.delete(node))nearObserver?.unobserve(node);
    releaseNearObserver();
  };
}
