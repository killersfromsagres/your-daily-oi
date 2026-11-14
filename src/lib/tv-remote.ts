// src/lib/tv-remote.ts — pure spatial scoring + remote keyboard navigation.
export type RemoteDirection = "up" | "down" | "left" | "right";
export interface FocusRect { left: number; top: number; width: number; height: number; }

export function spatialFocusScore(from: FocusRect, to: FocusRect, direction: RemoteDirection): number | null {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const dx = tx - fx, dy = ty - fy;
  const forward = direction === "right" ? dx : direction === "left" ? -dx
    : direction === "down" ? dy : -dy;
  if (forward <= 2) return null;
  const lateral = direction === "right" || direction === "left" ? Math.abs(dy) : Math.abs(dx);
  // Prefer a strongly aligned control, then its distance. Do not jump rows
  // when a closer button is on the current navigation line.
  return forward + lateral * 2.3 + (lateral > forward * 2 ? lateral * 0.7 : 0);
}

const SELECTOR = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  "[role=button][tabindex]", "[tabindex]:not([tabindex='-1'])",
].join(",");

export function remoteKey(event:Pick<KeyboardEvent,"key"|"keyCode">):string {
  const codes:Record<number,string>={37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",10009:"BrowserBack",461:"BrowserBack",4:"BrowserBack",13:"Enter",23:"Enter",415:"MediaPlay",19:"MediaPause",10252:"MediaPlayPause",403:"MediaPlayPause"};
  return codes[event.keyCode] || event.key;
}
function visibleElement(node: HTMLElement): boolean {
  if (node.closest("[inert], [aria-hidden='true']") || !node.getClientRects().length) return false;
  let parent:HTMLElement|null=node;
  while(parent){
    const style=window.getComputedStyle(parent);
    if(style.visibility==="hidden"||style.display==="none"||style.opacity==="0")return false;
    parent=parent.parentElement;
  }
  const r=node.getBoundingClientRect();return r.width>1&&r.height>1;
}
const rect=(r:DOMRect):FocusRect=>({left:r.left,top:r.top,width:r.width,height:r.height});
const editable=(target:EventTarget|null)=>target instanceof HTMLElement && !!target.closest("input,textarea,select,[contenteditable='true'],[role='slider'],[data-native-arrows]");
export function installTvRemoteNavigation(): () => void {
  let frame=0;
  const handler=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey)return;
    const key=remoteKey(event);
    if(editable(event.target)&&!["BrowserBack","Escape"].includes(key))return;
    const modal=[...document.querySelectorAll<HTMLElement>("[role='dialog']")].filter(visibleElement).at(-1);
    const player=document.querySelector<HTMLElement>(".ydo-player-container,.ydo-live-player-container");
    const fullscreen=!!document.fullscreenElement||!!document.querySelector(".is-theater");
    if(key==="BrowserBack"||key==="Escape"||key==="Backspace"&&!editable(event.target)){
      const close=modal?.querySelector<HTMLElement>('button[aria-label^="Fechar"]');
      if(close){event.preventDefault();close.click();return;}
      const searchClose=document.querySelector<HTMLButtonElement>(".ydo-header.is-searching .ydo-search-close");
      if(searchClose){event.preventDefault();searchClose.click();return;}
      if(editable(event.target)&&key==="Escape")return;
      const back=player?.querySelector<HTMLButtonElement>(".ydo-player-back-btn");
      if(back){event.preventDefault();back.click();return;}
      if(fullscreen&&document.exitFullscreen){event.preventDefault();void document.exitFullscreen().catch(()=>{});return;}
      if(history.length>1){event.preventDefault();history.back();}return;
    }
    if(["MediaPlay","MediaPause","MediaPlayPause"].includes(key)){
      const video=player?.querySelector("video");if(!video)return;
      event.preventDefault();
      if(key==="MediaPause"||key==="MediaPlayPause"&&!video.paused)video.pause();
      else void video.play().catch(()=>{});
      return;
    }
    // Some TV remotes send Select rather than a browser-native Enter click.
    if(key==="Select"||(key==="Enter"&&(event.key!=="Enter"||event.keyCode===23))){
      const current=document.activeElement as HTMLElement|null;
      if(current&&current!==document.body){event.preventDefault();current.click();}return;
    }
    const direction:RemoteDirection|null=key==="ArrowUp"?"up":key==="ArrowDown"?"down":key==="ArrowLeft"?"left":key==="ArrowRight"?"right":null;
    if(!direction)return;
    if(player && (fullscreen||player.contains(document.activeElement))){
      document.dispatchEvent(new Event("zf-reveal-player-controls"));
      if(player.dataset["controlsVisible"]==="false"){
        event.preventDefault();cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
          player.querySelector<HTMLElement>(".zf-player-toolbar button,.ydo-controls button")?.focus();
        });return;
      }
    }
    const root:Document|HTMLElement=modal||(fullscreen&&player?player:document);
    const nodes=[...root.querySelectorAll<HTMLElement>(SELECTOR)].filter(visibleElement);
    if(!nodes.length)return;
    const current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!current||!nodes.includes(current)){
      event.preventDefault();(nodes.find(node=>node.matches("[data-tv-initial-focus]"))||nodes[0])?.focus({preventScroll:true});return;
    }
    let best:HTMLElement|null=null,bestScore=Infinity;
    for(const candidate of nodes){
      if(candidate===current)continue;
      const score=spatialFocusScore(rect(current.getBoundingClientRect()),rect(candidate.getBoundingClientRect()),direction);
      if(score!==null&&score<bestScore){best=candidate;bestScore=score;}
    }
    if(best){event.preventDefault();best.focus({preventScroll:true});best.scrollIntoView({block:"nearest",inline:"nearest",behavior:"auto"});}
    else if(fullscreen||modal)event.preventDefault();
  };
  document.addEventListener("keydown",handler);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener("keydown",handler);};
}
