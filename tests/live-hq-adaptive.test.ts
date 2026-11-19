import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {liveHqBackend,liveHqFilter} from "../src/lib/live-hq-policy";

describe("live player HQ quality and latency policy",()=>{
 const desktop={width:640,height:360,mobile:false,cores:8,memoryGb:8,reducedMotion:false};
 test("WebGL sharpener only runs on capable devices and reasonable source sizes",()=>{
   expect(liveHqBackend(desktop)).toBe("webgl");
   expect(liveHqBackend({...desktop,width:1280,height:720})).toBe("webgl");
   expect(liveHqBackend({...desktop,width:1920,height:1080})).toBe("native");
   expect(liveHqBackend({...desktop,cores:2})).toBe("native");
   expect(liveHqBackend({...desktop,memoryGb:2})).toBe("native");
   expect(liveHqBackend({...desktop,reducedMotion:true})).toBe("native");
   expect(liveHqBackend({...desktop,width:0,height:0})).toBe("native");
 });
 test("mobile GPU safety keeps sports native above SD resolutions",()=>{
   expect(liveHqBackend({...desktop,mobile:true,width:640,height:360})).toBe("webgl");
   expect(liveHqBackend({...desktop,mobile:true,width:1280,height:720})).toBe("native");
   expect(liveHqBackend({...desktop,mobile:true,cores:4})).toBe("native");
 });
 test("native tuning never claims a fake 4K signal",()=>{
   expect(liveHqFilter(true,false)).toContain("contrast(1.025)");
   expect(liveHqFilter(false,false)).toBe("none");
   expect(liveHqFilter(true,true)).toBe("none");
 });
 test("TV HQ is user controlled and a GPU fallback never restarts the live stream",()=>{
   const live=readFileSync("src/components/player/LivePlayer.tsx","utf8");
   const css=readFileSync("src/styles/live-hq-adaptive.css","utf8");
   expect(live).toContain('localStorage.setItem("zangflix:tv-hq"');
   expect(live).toContain("useVideoEnhancer(videoRef,hqCanvasRef");
   expect(live).toContain("capLevelToPlayerSize=!enabled");
   expect(live).toContain("onLoadedMetadata={measureLiveQuality}");
   expect(live).toContain("aria-label={hqEnabled?");
   expect(live).toContain("setPlaybackSafety:enabled");
   expect(live).toContain("window.setInterval(checkEdge, 1250)");
   expect(live).toContain("engineManagesLatency:true");
   expect(live).toContain("const protectingFrames=Date.now()<smoothPlaybackUntilRef.current");
   expect(live).not.toContain("setPlayNonce(value => value + 1);\n  }, [hqEnabled]");
   expect(css).toContain(".ydo-live-hq-canvas.is-active");
   expect(css).toContain("pointer-events:none");
 });
 test("60 fps live WebGL budget keeps 30 fps VOD behavior unchanged",()=>{
   const shader=readFileSync("src/components/player/useVideoEnhancer.ts","utf8");
   expect(shader).toContain("live ? 15 : 32");
   expect(shader).toContain("live?8.5:18");
   expect(shader).toContain("frames===(live?8:1)");
   expect(shader).toContain("gl.texImage2D");
 });
});
