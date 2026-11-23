/** Match D-pad focus rows to the actual CSS grid breakpoints in TV UI. */
import {useEffect,useState} from "react";
export type TvGridKind="library"|"channels";
export function tvGridColumns(width:number,kind:TvGridKind):number{
  if(kind==="channels")
    return width<=600?2:width<=880?3:width<=1200?4:5;
  return width<=480?2:width<=700?3:width<=950?4:width<=1300?5:6;
}
export function useTvGridColumns(kind:TvGridKind):number{
  const [columns,setColumns]=useState(()=>
    tvGridColumns(typeof window==="undefined"?1920:window.innerWidth,kind));
  useEffect(()=>{
    const update=()=>setColumns(tvGridColumns(window.innerWidth,kind));
    update();window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[kind]);
  return columns;
}
