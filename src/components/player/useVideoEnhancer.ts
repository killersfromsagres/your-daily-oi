"use client";
// src/components/player/useVideoEnhancer.ts — lightweight single-pass WebGL2 HQ, desktop.
import { useEffect, useState, type RefObject } from "react";

export interface VideoEnhancerResult {
  active: boolean;
  supported: boolean;
  avgFrameMs: number;
}
const VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0., 1.);
  v_uv = (a_position + 1.) * .5;
}`;

// Five bilinear samples; source-adaptive local contrast without a second
// framebuffer, giant 2x texture or neural inference on the decoding GPU.
const SHARPEN = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_video;
uniform vec2 u_texel;
void main() {
  vec3 c = texture(u_video, v_uv).rgb;
  vec3 n = texture(u_video, v_uv + vec2(0., u_texel.y)).rgb;
  vec3 s = texture(u_video, v_uv - vec2(0., u_texel.y)).rgb;
  vec3 e = texture(u_video, v_uv + vec2(u_texel.x, 0.)).rgb;
  vec3 w = texture(u_video, v_uv - vec2(u_texel.x, 0.)).rgb;
  vec3 blur = (n+s+e+w) * .25;
  vec3 detail = c - blur;
  float strength = clamp(length(detail) * 2.5, 0., 1.);
  // Avoid ringing on already-sharp edges and amplify moderate texture.
  vec3 result = clamp(c + detail * (.26 + .26 * strength), 0., 1.);
  result = clamp((result - .5) * 1.035 + .5, 0., 1.);
  outColor = vec4(result, 1.);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not allocate shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const why = gl.getShaderInfoLog(shader) || "Shader compile failed";
    gl.deleteShader(shader);
    throw new Error(why);
  }
  return shader;
}
function program(gl: WebGL2RenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, SHARPEN);
  const p = gl.createProgram();
  if (!p) throw new Error("Could not allocate program");
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const why = gl.getProgramInfoLog(p) || "WebGL link failed";
    gl.deleteProgram(p);
    throw new Error(why);
  }
  return p;
}

export function useVideoEnhancer(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  onPerformanceDowngrade?: () => void,
): VideoEnhancerResult {
  const [active,setActive] = useState(false);
  const [supported,setSupported] = useState(true);
  const [avgFrameMs,setAvgFrameMs] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !video || !canvas) {
      setActive(false);
      return;
    }
    let gl: WebGL2RenderingContext | null = null;
    let shaderProgram: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let cancelled = false;
    let callbackId = 0;
    let usingVideoCallback = false;
    let frames = 0;
    let avgMs = 0;
    let previousDraw = 0;
    let lastSourceW = 0;
    let lastSourceH = 0;
    let lastDropped = 0;
    let lastTotal = 0;
    let setAside = false;

    const fail = (reason: string) => {
      if (setAside || cancelled) return;
      setAside = true;
      console.info("[ZANG FLIX HQ] switching to native playback:", reason);
      setSupported(false);
      setActive(false);
      onPerformanceDowngrade?.();
    };
    const schedule = () => {
      if (cancelled || setAside) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        usingVideoCallback = true;
        callbackId = video.requestVideoFrameCallback(() => render());
      } else {
        usingVideoCallback = false;
        callbackId = requestAnimationFrame(() => render());
      }
    };
    const onSourceChange = () => {
      lastSourceW = 0;
      lastSourceH = 0;
      frames = 0;
      avgMs = 0;
      setActive(false); // never show a stale frame from the previous episode
    };

    const render = () => {
      if (cancelled || setAside || !gl || !shaderProgram || !texture || !buffer) return;
      if (video.paused || video.ended || document.visibilityState !== "visible" ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.videoWidth === 0 || video.videoHeight === 0) {
        schedule();
        return;
      }
      const now = performance.now();
      // Never process more than 30 frames per second. The browser handles
      // the decoding clock and the original video remains available.
      if (now - previousDraw < 32) { schedule(); return; }
      previousDraw = now;

      const sourceW=video.videoWidth, sourceH=video.videoHeight;
      try {
        if (sourceW !== lastSourceW || sourceH !== lastSourceH) {
          if (sourceW > 1280 || sourceH > 720) { fail("source exceeds real-time budget"); return; }
          const dpr=Math.min(window.devicePixelRatio || 1, 1.5);
          const displayW=Math.min(1280, Math.max(sourceW, Math.round(video.clientWidth * dpr)));
          const renderW=Math.max(1,Math.min(sourceW*2,displayW));
          const renderH=Math.max(1,Math.round(renderW * sourceH / sourceW));
          canvas.width=renderW;
          canvas.height=Math.min(720,renderH);
          lastSourceW=sourceW;
          lastSourceH=sourceH;
        }
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
        gl.useProgram(shaderProgram);
        gl.uniform1i(gl.getUniformLocation(shaderProgram,"u_video"),0);
        gl.uniform2f(gl.getUniformLocation(shaderProgram,"u_texel"),1/sourceW,1/sourceH);
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        const position=gl.getAttribLocation(shaderProgram,"a_position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error("WebGL context error");
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error)); return;
      }
      const elapsed=performance.now()-now;
      avgMs=frames===0?elapsed:avgMs*.82+elapsed*.18;
      frames++;
      if (frames===1) {setSupported(true);setActive(true);}
      if (frames % 30===0) setAvgFrameMs(Math.round(avgMs));
      // Detect frame drops, not just synchronous JS timings. GPU work may be
      // queued asynchronously even if a draw call itself appears fast.
      if (frames % 45===0 && typeof video.getVideoPlaybackQuality==="function") {
        const q=video.getVideoPlaybackQuality();
        const dropped=q.droppedVideoFrames-lastDropped, total=q.totalVideoFrames-lastTotal;
        if (lastTotal>0 && total>25 && dropped/total>.12) {
          fail("video decoder dropped frames");return;
        }
        lastDropped=q.droppedVideoFrames;lastTotal=q.totalVideoFrames;
      }
      if (frames>18 && avgMs>18) {fail("per-frame GPU upload too expensive");return;}
      schedule();
    };

    try {
      gl=canvas.getContext("webgl2",{alpha:false,antialias:false,depth:false,stencil:false,
        desynchronized:true,powerPreference:"low-power"}) as WebGL2RenderingContext | null;
      if (!gl) throw new Error("WebGL2 not available");
      shaderProgram=program(gl);
      buffer=gl.createBuffer();
      texture=gl.createTexture();
      if (!buffer || !texture) throw new Error("WebGL allocation failed");
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      setSupported(true);
      setAvgFrameMs(0);
      video.addEventListener("emptied",onSourceChange);
      video.addEventListener("loadstart",onSourceChange);
      schedule();
    } catch(error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    return () => {
      cancelled=true;
      if (callbackId) {
        if (usingVideoCallback && typeof video.cancelVideoFrameCallback==="function")
          video.cancelVideoFrameCallback(callbackId);
        else cancelAnimationFrame(callbackId);
      }
      video.removeEventListener("emptied",onSourceChange);
      video.removeEventListener("loadstart",onSourceChange);
      setActive(false);
      if(gl) {
        if(shaderProgram) gl.deleteProgram(shaderProgram);
        if(texture) gl.deleteTexture(texture);
        if(buffer) gl.deleteBuffer(buffer);
        // Free shader resources before switching back to hardware decoder.
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    };
  },[videoRef,canvasRef,enabled,onPerformanceDowngrade]);

  return {active,supported,avgFrameMs};
}
