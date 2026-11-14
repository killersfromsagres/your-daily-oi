// CI-only production-player fixture. No copyrighted or external media.
import {useState} from "react";
import {createRoot} from "react-dom/client";
import {OwnPlayer} from "../../src/components/player/OwnPlayer";
import type {StreamSource} from "../../src/lib/types";
const mode=new URL(location.href).searchParams.get("mode")||"movie";
const foreign:StreamSource={url:"/media/must-never-play-leg.mp4",audio:"leg",quality:"4K",name:"Original LEG"};
const streams:StreamSource[]=mode==="leg-only" ? [foreign] : [foreign,
 {url:"/media/broken-dub-1080p.mp4",audio:"dub",quality:"1080p",name:"Dublado Full HD"},
 {url:"/media/good-dub-720p.mp4",audio:"dub",quality:"720p",name:"Dublado HD"},
];
function Fixture(){
 const [closed,setClosed]=useState(false);
 return closed ? <button data-return-card>Assistir Filme</button> : <OwnPlayer streams={streams}
  onBack={()=>setClosed(true)} title="Verificação de dublagem e HQ" contentType={mode==="series"?"series":mode==="anime"?"anime":"movie"}/>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
