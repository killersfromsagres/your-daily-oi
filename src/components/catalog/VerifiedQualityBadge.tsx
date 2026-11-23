"use client";
import {useEffect,useRef,useState} from "react";
import type {StreamSource} from "@/lib/types";
import {requestCatalogQuality} from "@/lib/vod-quality-client";
import {QUALITY_CHANGED_EVENT,describeMediaQuality,readVerifiedMediaQuality,
  qualityBadgePalette,type MediaQualityBadgeInfo,type MediaQualityKey} from "@/lib/verified-media-quality";
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
  const [probeState,setProbeState]=useState<"idle"|"loading"|"slow"|"complete">("idle");
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
    // A queued request is not proof that the provider lacks metadata.
    // Avoid a spinner that remains visible while dozens of cards are queued.
    const timer=window.setTimeout(()=>{
      if(mounted)setProbeState(current=>current==="loading"?"slow":current);
    },8500);
    void requestCatalogQuality(media).then(data=>{
      if(mounted){setRemote(data);setProbeState("complete");}
    }).finally(()=>window.clearTimeout(timer));
    return()=>{mounted=false;window.clearTimeout(timer)};
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
      detail:"Verificando os metadados do arquivo ou manifesto; nenhuma resolução foi presumida."}
    :quality.tier==="unknown"&&probeState==="slow"
      ?{...quality,label:"AUTO",
        detail:"Análise em andamento no servidor. A resolução será atualizada quando houver evidência."}
      :quality.tier==="unknown"&&probeState==="complete"
        ?{...quality,label:"AUTO",
          detail:"A fonte não fornece metadados de resolução verificáveis. A qualidade real será medida ao reproduzir; AUTO não significa HD."}
        :quality;
  const colors=qualityBadgePalette(display.tier);
  return <span ref={target} className={(compact?"ydo-badge ":"")+className}
    data-video-quality={display.tier} data-quality-verified={display.verified}
    title={display.detail} aria-label={display.label+". "+display.detail}
    style={{
      fontSize:"0.75rem",fontWeight:800,letterSpacing:"0.04em",
      color:colors.color,
      backgroundColor:colors.background,
      border:"1px solid "+colors.border,
      padding:compact?"2px 7px":"3px 9px",borderRadius:6,
    }}>
    {display.label}
  </span>;
}
