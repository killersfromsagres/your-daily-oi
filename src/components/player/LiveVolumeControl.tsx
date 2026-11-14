import {useEffect,useRef,useState} from "react";
import {Minus,Plus,Volume2,VolumeX,X} from "lucide-react";
import {stepVolume} from "@/lib/live-volume";
export function LiveVolumeControl({volume,muted,onVolume,onMute,onDialogChange,otherOpen=false,hardwareOnly=false}: {
 volume:number;muted:boolean;onVolume:(value:number)=>void;onMute:()=>void;
 onDialogChange:(open:boolean)=>void;otherOpen?:boolean;hardwareOnly?:boolean;
}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{onDialogChange(open);},[open,onDialogChange]);
 useEffect(()=>{if(otherOpen)setOpen(false);},[otherOpen]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();setOpen(false);trigger.current?.focus();}};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
 },[open]);
 const level=muted?0:volume;
 return <div className="zf-live-volume" ref={root}>
  <button ref={trigger} type="button" className="zf-player-action" aria-label="Ajustar volume" title="Volume"
   aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(value=>!value)}>
   {level===0?<VolumeX size={16}/>:<Volume2 size={16}/>}<span className="zf-volume-indicator" aria-hidden>{Math.round(level*100)}</span>
  </button>
  {open&&<div className="zf-volume-panel" role="dialog" aria-label="Volume da transmissão">
   <header><strong>Volume</strong><output aria-live="polite">{Math.round(level*100)}%</output>
    <button type="button" aria-label="Fechar volume" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={16}/></button></header>
   <div className="zf-volume-slider">
    <button type="button" aria-label="Diminuir volume" onClick={()=>onVolume(stepVolume(level,-1))}><Minus size={18}/></button>
    <input type="range" min="0" max="1" step="0.01" value={level} aria-label="Volume" aria-valuetext={Math.round(level*100)+" por cento"}
     onChange={event=>onVolume(Number(event.target.value))}/>
    <button type="button" aria-label="Aumentar volume" onClick={()=>onVolume(stepVolume(level,1))}><Plus size={18}/></button>
   </div>
   {hardwareOnly&&<p className="zf-volume-hardware" role="status">Use os botões de volume do aparelho.</p>}
   <button type="button" className="zf-volume-mute" onClick={onMute}>{level===0?<VolumeX size={16}/>:<Volume2 size={16}/>}{level===0?"Ativar som":"Silenciar"}</button>
  </div>}
 </div>;
}
