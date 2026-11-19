"use client";
/**
 * Sports field reconstruction before upscaling.
 *
 * Some TV providers deliver 25i/30i source fields into a nominally
 * progressive decoded frame. The codec/browser may also already deinterlace
 * the source; therefore this filter adapts PER PIXEL and requires BOTH
 * alternating-line contrast and temporal motion before fixing a scanline.
 *
 * Previous frame and current frame stay as GPU textures; no CPU readback or
 * second live network request. Real interpolation requires source pixels to
 * be accessible (CORS/DRM may forbid that). Never modifies the media clock.
 */
import {useEffect,useState,type RefObject} from "react";

export function isSportsLiveChannel(name:string,category:string):boolean {
  return /\b(premiere|sportv|espn|tnt\s*sports|band\s*sports|caz[eé]\s*tv|ge\s*tv|futebol|esportes|sports|futemax)\b/i
    .test(name+" "+category);
}
export function combingConfidence(input:{
  center:number;above:number;below:number;previous:number;
}):number {
  const {center,above,below,previous}=input;
  const comb=Math.max(0,Math.abs(center-(above+below)/2)-Math.abs(above-below)*.5);
  const movement=Math.abs(center-previous);
  const smooth=(a:number,b:number,x:number)=>Math.max(0,Math.min(1,(x-a)/(b-a)));
  return smooth(.035,.15,comb)*smooth(.008,.055,movement);
}

export const LIVE_DEINTERLACE_VERTEX=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){gl_Position=vec4(a_position,0.,1.);v_uv=(a_position+1.)*.5;}`;
export const LIVE_DEINTERLACE_FRAGMENT=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform vec2 u_texel;
uniform float u_previousValid;

float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 src(vec2 p){return texture(u_current,clamp(p,vec2(0.),vec2(1.))).rgb;}

void main(){
 vec3 center=src(v_uv);
 vec3 above=src(v_uv-vec2(0.,u_texel.y));
 vec3 below=src(v_uv+vec2(0.,u_texel.y));
 float zigzag=max(0.,abs(luma(center)-(luma(above)+luma(below))*.5)
                        -abs(luma(above)-luma(below))*.5);
 vec3 earlier=texture(u_previous,v_uv).rgb;
 float moved=abs(luma(center)-luma(earlier));
 float confidence=smoothstep(.035,.15,zigzag)*smoothstep(.008,.055,moved)
                  *u_previousValid;
 // Reconstruct ONLY the combed scanline from adjacent lines. Estimate the
 // local edge slope so fine field markings do not become blurred ladders.
 vec3 leftAbove=src(v_uv+u_texel*vec2(-1.,-1.));
 vec3 rightBelow=src(v_uv+u_texel*vec2(1.,1.));
 vec3 rightAbove=src(v_uv+u_texel*vec2(1.,-1.));
 vec3 leftBelow=src(v_uv+u_texel*vec2(-1.,1.));
 float diagA=abs(luma(leftAbove)-luma(rightBelow));
 float diagB=abs(luma(rightAbove)-luma(leftBelow));
 float vertical=abs(luma(above)-luma(below));
 vec3 estimate=(above+below)*.5;
 if(min(diagA,diagB)+.01<vertical){
   estimate=diagA<diagB?(leftAbove+rightBelow)*.5:
                            (rightAbove+leftBelow)*.5;
 }
 float oddLine=mod(floor(gl_FragCoord.y),2.);
 // Limit blending to displaced field lines; progressive 50/60fps frames
 // keep native pixel resolution and are not blurred indiscriminately.
 vec3 result=mix(center,estimate,confidence*oddLine*.93);
 outColor=vec4(result,1.);
}`;

function compile(gl:WebGL2RenderingContext,type:number,source:string):WebGLShader{
 const shader=gl.createShader(type);
 if(!shader)throw Error("Cannot allocate deinterlace shader");
 gl.shaderSource(shader,source);gl.compileShader(shader);
 if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
   const why=gl.getShaderInfoLog(shader)||"Deinterlace shader failure";
   gl.deleteShader(shader);throw Error(why);
 }
 return shader;
}
export type DeinterlaceState={
  active:boolean;failed:boolean;avgFrameMs:number;
};
export function useSportsDeinterlacer(
 videoRef:RefObject<HTMLVideoElement|null>,
 canvasRef:RefObject<HTMLCanvasElement|null>,
 enabled:boolean,
):DeinterlaceState{
 const [active,setActive]=useState(false);
 const [failed,setFailed]=useState(false);
 const [avgFrameMs,setAvgFrameMs]=useState(0);
 useEffect(()=>{
   const video=videoRef.current,canvas=canvasRef.current;
   if(!enabled||!video||!canvas){setActive(false);setFailed(false);return;}
   let gl:WebGL2RenderingContext|null=null;
   let program:WebGLProgram|null=null;
   let vertexBuffer:WebGLBuffer|null=null;
   let textures:[WebGLTexture,WebGLTexture]|null=null;
   let scheduled=0,useVideoCallback=false,stopped=false;
   let frame=0,previousTick=0,average=0,width=0,height=0;
   let lastDropped=0,lastTotal=0;
   const cancel=()=>{
     stopped=true;
     if(scheduled){
       if(useVideoCallback&&typeof video.cancelVideoFrameCallback==="function")
         video.cancelVideoFrameCallback(scheduled);
       else cancelAnimationFrame(scheduled);
     }
   };
   const disable=(reason:string)=>{
     if(stopped)return;
     console.info("[ZANG FLIX] deinterlace fallback:",reason);
     cancel();setFailed(true);setActive(false);
   };
   const schedule=()=>{
     if(stopped)return;
     if(typeof video.requestVideoFrameCallback==="function"){
       useVideoCallback=true;
       scheduled=video.requestVideoFrameCallback(()=>render());
     }else{
       useVideoCallback=false;scheduled=requestAnimationFrame(()=>render());
     }
   };
   const render=()=>{
     if(!gl||!program||!textures||!vertexBuffer||stopped)return;
     if(video.paused||video.ended||document.visibilityState!=="visible"||
        video.readyState<HTMLMediaElement.HAVE_CURRENT_DATA||!video.videoWidth){
       schedule();return;
     }
     const start=performance.now();
     // One decoded frame each ~16.7ms; no CPU processing or frame creation.
     if(start-previousTick<14){schedule();return;}
     previousTick=start;
     try{
       if(width!==video.videoWidth||height!==video.videoHeight){
         width=video.videoWidth;height=video.videoHeight;frame=0;
         const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
         if(width>1920||height>1080||
            (mobile&&(width>1280||height>720)))
           throw Error("source above safe GPU field budget");
         canvas.width=width;canvas.height=height;
         gl.viewport(0,0,width,height);
         for(const tex of textures){
           gl.bindTexture(gl.TEXTURE_2D,tex);
           gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,
             gl.UNSIGNED_BYTE,null);
         }
       }
       const current=textures[frame%2]!,previous=textures[(frame+1)%2]!;
       gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,current);
       gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
       gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
       gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,previous);
       gl.useProgram(program);
       gl.uniform1i(gl.getUniformLocation(program,"u_current"),0);
       gl.uniform1i(gl.getUniformLocation(program,"u_previous"),1);
       gl.uniform2f(gl.getUniformLocation(program,"u_texel"),1/width,1/height);
       gl.uniform1f(gl.getUniformLocation(program,"u_previousValid"),frame>0?1:0);
       gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);
       const position=gl.getAttribLocation(program,"a_position");
       gl.enableVertexAttribArray(position);
       gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
       gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
       if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error("GPU context lost");
       frame++;
     }catch(e){disable(e instanceof Error?e.message:String(e));return;}
     const spent=performance.now()-start;
     average=frame===1?spent:average*.85+spent*.15;
     if(frame===8)setActive(true);
     if(frame%25===0)setAvgFrameMs(Math.round(average));
     if(frame>18&&average>8.5){disable("GPU deinterlace too slow");return;}
     if(frame%45===0&&typeof video.getVideoPlaybackQuality==="function"){
       const quality=video.getVideoPlaybackQuality();
       const delta=quality.totalVideoFrames-lastTotal;
       const dropped=quality.droppedVideoFrames-lastDropped;
       if(lastTotal>0&&delta>22&&dropped/delta>.1){
         disable("Live decoder losing video frames");return;
       }
       lastTotal=quality.totalVideoFrames;lastDropped=quality.droppedVideoFrames;
     }
     schedule();
   };
   try{
     gl=canvas.getContext("webgl2",{alpha:false,antialias:false,
       desynchronized:true,depth:false,stencil:false,
       powerPreference:"low-power"}) as WebGL2RenderingContext|null;
     if(!gl)throw Error("WebGL2 unavailable");
     const vs=compile(gl,gl.VERTEX_SHADER,LIVE_DEINTERLACE_VERTEX);
     const fs=compile(gl,gl.FRAGMENT_SHADER,LIVE_DEINTERLACE_FRAGMENT);
     program=gl.createProgram();
     if(!program)throw Error("Cannot create deinterlace program");
     gl.attachShader(program,vs);gl.attachShader(program,fs);
     gl.linkProgram(program);
     gl.deleteShader(vs);gl.deleteShader(fs);
     if(!gl.getProgramParameter(program,gl.LINK_STATUS))
       throw Error(gl.getProgramInfoLog(program)||"Field shader link error");
     const a=gl.createTexture(),b=gl.createTexture();
     if(!a||!b)throw Error("Field textures unavailable");
     textures=[a,b];
     for(const t of textures){
       gl.bindTexture(gl.TEXTURE_2D,t);
       gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
       gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
       gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
     }
     vertexBuffer=gl.createBuffer();
     if(!vertexBuffer)throw Error("Field vertex buffer unavailable");
     gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);
     gl.bufferData(gl.ARRAY_BUFFER,
       new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
     const reset=()=>{frame=0;width=0;height=0;setActive(false);};
     video.addEventListener("loadstart",reset);
     video.addEventListener("emptied",reset);
     setFailed(false);
     schedule();
     return ()=>{
       cancel();
       video.removeEventListener("loadstart",reset);
       video.removeEventListener("emptied",reset);
       setActive(false);
       if(gl){
         if(program)gl.deleteProgram(program);
         if(vertexBuffer)gl.deleteBuffer(vertexBuffer);
         for(const tex of textures||[])gl.deleteTexture(tex);
       }
     };
   }catch(e){
     disable(e instanceof Error?e.message:String(e));
     if(gl){
       if(program)gl.deleteProgram(program);
       if(vertexBuffer)gl.deleteBuffer(vertexBuffer);
       for(const tex of textures||[])gl.deleteTexture(tex);
     }
     return ()=>{cancel();};
   }
 },[videoRef,canvasRef,enabled]);
 return {active,failed,avgFrameMs};
}
