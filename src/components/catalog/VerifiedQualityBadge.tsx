"use client";
import {useEffect,useRef,useState} from "react";
import type {StreamSource} from "@/lib/types";
import {requestCatalogQuality} from "@/lib/vod-quality-client";
import {QUALITY_CHANGED_EVENT,describeMediaQuality,readVerifiedMediaQuality,
  type MediaQualityBadgeInfo,type MediaQualityKey} from "@/lib/verified-media-quality";
const EMPTY_STREAMS:readonly StreamSource[]=[];
interface Props{
  media:MediaQualityKey;
  streams?:readonly StreamSource[];
  compact?:boolean;
  className?:string;
}
export function VerifiedQualityBadge({media,streams=EMPTY_STREAMS,compact=false,className=""}:Props){
  const target=useRef<HTMLSpanElement>(null);
  const [remote,setRemote]=useState<MediaQualityBadgeInfo|null>(null);
  const [probeState,setProbeState]=useState<"idle"|"loading"|"complete">("idle");
  const [visible,setVisible]=useState(false);
  const [quality,setQuality]=useState<MediaQualityBadgeInfo>(()=>
    describeMediaQuality(streams,null,{seriesAggregate:media.type!=="f"&&media.episode===undefined}));

  useEffect(()=>{
    const el=target.current;
    if(!el)return;
    if(typeof IntersectionObserver==="undefined"){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){
        setVisible(true);observer.disconnect();
      }
    },{rootMargin:"200px"});
    observer.observe(el);
    return()=>observer.disconnect();
  },[media.id,media.type,media.season,media.episode]);

  useEffect(()=>{
    let mounted=true;
    setRemote(null);
    if(!visible||!media.id){setProbeState("idle");return;}
    setProbeState("loading");
    // Single global queue limits expensive provider metadata requests even
    // when 40 poster cards become visible at the same time.
    void requestCatalogQuality(media).then(data=>{
      if(mounted){setRemote(data);setProbeState("complete");}
    });
    return()=>{mounted=false};
  },[visible,media.id,media.type,media.season,media.episode]);

  useEffect(()=>{
    const refresh=()=>setQuality(describeMediaQuality(streams,readVerifiedMediaQuality(media),
      {seriesAggregate:media.type!=="f"&&media.episode===undefined,remote}));
    refresh();
    window.addEventListener(QUALITY_CHANGED_EVENT,refresh);
    window.addEventListener("storage",refresh);
    return()=>{
      window.removeEventListener(QUALITY_CHANGED_EVENT,refresh);
      window.removeEventListener("storage",refresh);
    };
  },[media.type,media.id,media.season,media.episode,streams,remote]);

  const display=quality.tier==="unknown"&&probeState==="loading"
    ?{...quality,label:"ANALISANDO…",
      detail:"Consultando metadados das fontes reais deste título."}
    :quality.tier==="unknown"&&probeState==="complete"
      ?{...quality,label:"SEM DADOS",
        detail:"Nenhuma resolução confiável pôde ser obtida das fontes disponíveis. Não é correto inventar HD ou 4K."}
      :quality;
  return <span ref={target} className={(compact?"ydo-badge ":"")+className}
    data-video-quality={display.tier} data-quality-verified={display.verified}
    title={display.detail} aria-label={display.label+". "+display.detail}
    style={compact?undefined:{
      fontSize:"0.75rem",fontWeight:800,letterSpacing:"0.04em",
      color:quality.tier==="cam"?"#ffb0ad":quality.verified?"#e8d8ff":"#d6d9e2",
      backgroundColor:quality.tier==="cam"?"rgba(174,48,48,.18)":"rgba(255,255,255,.11)",
      border:quality.tier==="cam"?"1px solid rgba(255,115,115,.4)":"1px solid rgba(255,255,255,.22)",
      padding:"3px 9px",borderRadius:6,
    }}>
    {display.label}
  </span>;
}
