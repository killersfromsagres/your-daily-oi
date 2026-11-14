"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { isMobileLandscapeTarget, shouldRotateFullscreenFallback, tryLockLandscape, unlockLandscape, type OrientationLock } from "@/lib/fullscreen-orientation";

type Video = HTMLVideoElement & { webkitEnterFullscreen?:()=>void; webkitExitFullscreen?:()=>void; webkitDisplayingFullscreen?:boolean };
type FullDocument = Document & { webkitFullscreenElement?:Element; webkitExitFullscreen?:()=>Promise<void>|void };
const nativeElement = () => document.fullscreenElement || (document as FullDocument).webkitFullscreenElement;
const orientation = () => typeof screen === "undefined" ? null : screen.orientation as OrientationLock;
const portrait = () => window.innerHeight > window.innerWidth;
const mobile = () => isMobileLandscapeTarget({userAgent:navigator.userAgent,viewportWidth:window.innerWidth,
  coarsePointer:window.matchMedia?.("(pointer: coarse)").matches ?? false});

/** Fullscreen is requested synchronously from the tap; landscape follows only
 * after entry. A rotated inner surface covers browsers that reject the lock. */
export function usePlayerFullscreen(containerRef:RefObject<HTMLElement|null>,videoRef:RefObject<HTMLVideoElement|null>) {
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [theaterFullscreen,setTheaterFullscreen]=useState(false);
  const [rotateLandscapeFallback,setRotateLandscapeFallback]=useState(false);
  const active=useRef(false),theater=useRef(false),ownedLock=useRef(false),pendingLock=useRef(false);
  const generation=useRef(0),mounted=useRef(true);
  const belongs=useCallback(()=>{
    const element=nativeElement(),container=containerRef.current;
    return Boolean((element&&container&&(element===container||container.contains(element)))||
      (videoRef.current as Video|null)?.webkitDisplayingFullscreen);
  },[containerRef,videoRef]);
  const release=useCallback(()=>{
    generation.current++;active.current=false;theater.current=false;
    if(ownedLock.current){unlockLandscape(orientation());ownedLock.current=false;}
    if(mounted.current){setIsFullscreen(false);setTheaterFullscreen(false);setRotateLandscapeFallback(false);}
  },[]);
  const applyLandscape=useCallback(async()=>{
    if(!mobile()||!active.current||!belongs()||ownedLock.current||pendingLock.current)return;
    const attempt=generation.current;
    pendingLock.current=true;
    setRotateLandscapeFallback(portrait());
    const locked=await tryLockLandscape(orientation());
    pendingLock.current=false;
    if(!mounted.current||attempt!==generation.current||!active.current||!belongs()){
      if(locked)unlockLandscape(orientation());
      return;
    }
    ownedLock.current=locked;
    setRotateLandscapeFallback(shouldRotateFullscreenFallback({mobile:true,portrait:portrait(),orientationLocked:locked}));
  },[belongs]);
  const toggle=useCallback(()=>{
    const container=containerRef.current as (HTMLElement & {webkitRequestFullscreen?:()=>Promise<void>|void})|null;
    const video=videoRef.current as Video|null;
    if(!container)return;
    if(active.current||belongs()){
      if(theater.current){release();return;}
      if(!belongs()){release();return;}
      if(video?.webkitDisplayingFullscreen){video.webkitExitFullscreen?.();release();return;}
      const exit=document.exitFullscreen?.bind(document)||(document as FullDocument).webkitExitFullscreen?.bind(document);
      if(exit){try{void Promise.resolve(exit()).then(release).catch(()=>{});}catch{/* Keep the exit control available. */}}
      return;
    }
    const attempt=++generation.current;
    active.current=true;
    const fallback=()=>{
      if(!mounted.current||attempt!==generation.current)return;
      theater.current=true;setTheaterFullscreen(true);setIsFullscreen(true);
      setRotateLandscapeFallback(shouldRotateFullscreenFallback({mobile:mobile(),portrait:portrait(),orientationLocked:false}));
    };
    const nativeVideo=()=>{
      if(video?.webkitEnterFullscreen&&(!mobile()||!portrait())){
        try{video.webkitEnterFullscreen();return;}catch{/* Use the inline surface. */}
      }
      fallback();
    };
    try{
      if(typeof container.requestFullscreen==="function"){
        void container.requestFullscreen().then(()=>{
          if(attempt===generation.current)void applyLandscape();
          else if(belongs())void document.exitFullscreen?.().catch(()=>{});
        }).catch(nativeVideo);
      }else if(container.webkitRequestFullscreen){
        void Promise.resolve(container.webkitRequestFullscreen()).then(()=>{
          if(attempt!==generation.current)return;
          if(belongs())void applyLandscape();else fallback();
        }).catch(nativeVideo);
      }else nativeVideo();
    }catch{nativeVideo();}
  },[containerRef,videoRef,belongs,applyLandscape,release]);
  useEffect(()=>{
    mounted.current=true;
    const video=videoRef.current;
    const container=containerRef.current;
    const onChange=()=>{
      if(belongs()){
        if(!active.current)return;
        active.current=true;setIsFullscreen(true);void applyLandscape();
      }else if(!theater.current)release();
    };
    const onResize=()=>{
      if(active.current)setRotateLandscapeFallback(shouldRotateFullscreenFallback({
        mobile:mobile(),portrait:portrait(),orientationLocked:ownedLock.current,
      }));
    };
    const onEnd=()=>release();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&theater.current){event.preventDefault();release();}
    };
    document.addEventListener("fullscreenchange",onChange);
    document.addEventListener("webkitfullscreenchange",onChange);
    video?.addEventListener("webkitbeginfullscreen",onChange);
    video?.addEventListener("webkitendfullscreen",onEnd);
    window.addEventListener("resize",onResize,{passive:true});
    window.addEventListener("orientationchange",onResize);
    window.addEventListener("keydown",onKey);
    return()=>{
      mounted.current=false;generation.current++;active.current=false;
      // Closing a route must also release the native fullscreen surface.
      if((container && nativeElement()===container) || (video as Video|null)?.webkitDisplayingFullscreen){
        if((video as Video|null)?.webkitDisplayingFullscreen)(video as Video).webkitExitFullscreen?.();
        else {
          const exit=document.exitFullscreen?.bind(document)||(document as FullDocument).webkitExitFullscreen?.bind(document);
          try{if(exit)void Promise.resolve(exit()).catch(()=>{});}catch{/* Route unmount still proceeds. */}
        }
      }
      document.removeEventListener("fullscreenchange",onChange);
      document.removeEventListener("webkitfullscreenchange",onChange);
      video?.removeEventListener("webkitbeginfullscreen",onChange);
      video?.removeEventListener("webkitendfullscreen",onEnd);
      window.removeEventListener("resize",onResize);
      window.removeEventListener("orientationchange",onResize);
      window.removeEventListener("keydown",onKey);
      if(ownedLock.current){unlockLandscape(orientation());ownedLock.current=false;}
    };
  },[videoRef,belongs,applyLandscape,release]);
  useEffect(()=>{
    if(!theaterFullscreen)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=previous;};
  },[theaterFullscreen]);
  return {isFullscreen,theaterFullscreen,rotateLandscapeFallback,toggle};
}
