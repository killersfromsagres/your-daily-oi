"use client";
import {useEffect,useState} from "react";
import type {StreamSource} from "@/lib/types";
import {QUALITY_CHANGED_EVENT,describeMediaQuality,readVerifiedMediaQuality,
  type MediaQualityBadgeInfo,type MediaQualityKey} from "@/lib/verified-media-quality";
interface Props{
  media:MediaQualityKey;
  streams?:readonly StreamSource[];
  compact?:boolean;
  className?:string;
}
export function VerifiedQualityBadge({media,streams=[],compact=false,className=""}:Props){
  const [quality,setQuality]=useState<MediaQualityBadgeInfo>(()=>
    describeMediaQuality(streams,null,{seriesAggregate:media.type!=="f"&&media.episode===undefined}));
  useEffect(()=>{
    const refresh=()=>setQuality(describeMediaQuality(streams,readVerifiedMediaQuality(media),
      {seriesAggregate:media.type!=="f"&&media.episode===undefined}));
    refresh();
    window.addEventListener(QUALITY_CHANGED_EVENT,refresh);
    window.addEventListener("storage",refresh);
    return()=>{
      window.removeEventListener(QUALITY_CHANGED_EVENT,refresh);
      window.removeEventListener("storage",refresh);
    };
  },[media.type,media.id,media.season,media.episode,streams]);
  return <span className={(compact?"ydo-badge ":"")+className}
    data-video-quality={quality.tier} data-quality-verified={quality.verified}
    title={quality.detail} aria-label={quality.label+". "+quality.detail}
    style={compact?undefined:{
      fontSize:"0.75rem",fontWeight:800,letterSpacing:"0.04em",
      color:quality.tier==="cam"?"#ffb0ad":quality.verified?"#e8d8ff":"#d6d9e2",
      backgroundColor:quality.tier==="cam"?"rgba(174,48,48,.18)":"rgba(255,255,255,.11)",
      border:quality.tier==="cam"?"1px solid rgba(255,115,115,.4)":"1px solid rgba(255,255,255,.22)",
      padding:"3px 9px",borderRadius:6,
    }}>
    {quality.label}
  </span>;
}
