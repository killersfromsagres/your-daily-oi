"use client";
import {useEffect,useRef,useState} from "react";
import type {StreamSource} from "@/lib/types";
import {requestCatalogQuality} from "@/lib/vod-quality-client";
import {observeQualityBadge,subscribeQualityBadgeUpdates} from "@/lib/quality-badge-observer";
import {describeMediaQuality,readVerifiedMediaQuality,
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

  // One IntersectionObserver is shared by all the visible catalog cards.
  // A long catalog no longer creates one browser observer per title.
  useEffect(()=>{
    const el=target.current;
    if(!el)return;
    return observeQualityBadge(el,()=>setVisible(true));
  },[media.id,media.type,media.season,media.episode]);

  useEffect(()=>{
    let mounted=true;
    setRemote(null);
    if(!visible||!media.id){setProbeState("idle");return;}
    setProbeState("loading");
    const timer=window.setTimeout(()=>{
      if(mounted)setProbeState(current=>current==="loading"?"slow":current);
    },8500);
    // Rate-limited network work is already deduplicated across badge copies.
    void requestCatalogQuality(media).then(data=>{
      if(mounted){setRemote(data);setProbeState("complete");}
    }).finally(()=>window.clearTimeout(timer));
    return()=>{mounted=false;window.clearTimeout(timer)};
  },[visible,media.id,media.type,media.season,media.episode]);

  useEffect(()=>{
    const refresh=()=>{
      const next=describeMediaQuality(streams,readVerifiedMediaQuality(media),
        {seriesAggregate:media.type!=="f"&&media.episode===undefined,remote});
      // A quality event for another title must never redraw every poster.
      setQuality(previous=>previous.label===next.label&&previous.tier===next.tier&&
        previous.detail===next.detail&&previous.verified===next.verified?previous:next);
    };
    refresh();
    return subscribeQualityBadgeUpdates(media,refresh);
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
  return <span ref={target} className={"zf-quality-badge "+(compact?"ydo-badge ":"")+className}
    data-video-quality={display.tier} data-quality-verified={display.verified}
    title={display.detail} aria-label={display.label+". "+display.detail}
    style={{
      display:"inline-flex",alignItems:"center",justifyContent:"center",
      whiteSpace:"nowrap",lineHeight:1.3,minHeight:compact?22:25,
      fontSize:compact?"0.64rem":"0.75rem",fontWeight:900,letterSpacing:"0.045em",
      opacity:1,isolation:"isolate",
      color:colors.color,backgroundColor:colors.background,
      border:"1px solid "+colors.border,boxShadow:"0 3px 10px rgba(0,0,0,.68)",
      textShadow:"0 1px 1px #0005",
      padding:compact?"3px 7px":"4px 10px",borderRadius:6,
    }}>
    {display.label}
  </span>;
}
