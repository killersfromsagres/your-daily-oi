// CI-only harness; this entry is never part of the deployed application build.
import { useRef } from "react";
import { createRoot } from "react-dom/client";
import { usePlayerFullscreen } from "../../src/components/player/usePlayerFullscreen";
function Player(){
  const container=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null);
  const state=usePlayerFullscreen(container,video);
  return <div ref={container} id="player" className={"ydo-player-container"+(state.theaterFullscreen?" is-theater":"")+(state.rotateLandscapeFallback?" is-landscape-fallback":"")}
    data-fullscreen={state.isFullscreen}>
    <div className="zf-fullscreen-surface" style={{background:"#101824",color:"white"}}>
      <video ref={video} playsInline style={{position:"absolute",inset:0,width:"100%",height:"100%"}}/>
      <p style={{position:"absolute",left:20,top:20}}>ZANG FLIX · horizontal fullscreen</p>
      <button id="expand" onClick={state.toggle} style={{position:"absolute",bottom:15,right:15,minWidth:48,minHeight:48}}>
        {state.isFullscreen?"Sair":"Expandir"}
      </button>
    </div>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Player/>);
