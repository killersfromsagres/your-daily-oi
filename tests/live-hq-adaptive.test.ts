import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {liveHqBackend,liveHqFilter} from "../src/lib/live-hq-policy";
import {automaticHqEnabled,visibleLiveHqStatus} from "../src/lib/automatic-hq";

describe("automatic HQ neural + edge adaptive spatial enhancement",()=>{
 const desktop={width:640,height:360,mobile:false,cores:8,memoryGb:8,reducedMotion:false,webgpu:true};
 test("automatic HQ is on without preferences, explicit false remains respected",()=>{
   expect(automaticHqEnabled(null)).toBe(true);
   expect(automaticHqEnabled(undefined)).toBe(true);
   expect(automaticHqEnabled("true")).toBe(true);
   expect(automaticHqEnabled("false")).toBe(false);
   const live=readFileSync("src/components/player/LivePlayer.tsx","utf8");
   const vod=readFileSync("src/components/player/OwnPlayer.tsx","utf8");
   expect(live).toContain('localStorage.getItem("zangflix:tv-hq")');
   expect(live).toContain("setHqEnabled(automaticHqEnabled(saved))");
   expect(vod).toContain('localStorage.getItem("zangflix:ai-upscale")');
   expect(vod).toContain("setHqEnabled(automaticHqEnabled(saved))");
 });
 test("trained WebGPU neural 2x is chosen for adequate small live video",()=>{
   expect(liveHqBackend(desktop)).toBe("neural");
   expect(liveHqBackend({...desktop,width:960,height:540})).toBe("neural");
   expect(liveHqBackend({...desktop,width:1280,height:720})).toBe("spatial");
   expect(liveHqBackend({...desktop,webgpu:false})).toBe("spatial");
   expect(liveHqBackend({...desktop,cores:2})).toBe("native");
   expect(liveHqBackend({...desktop,memoryGb:2})).toBe("native");
   expect(liveHqBackend({...desktop,reducedMotion:true})).toBe("native");
   expect(liveHqBackend({...desktop,width:1920,height:1080})).toBe("native");
   expect(liveHqBackend({...desktop,width:0,height:0})).toBe("native");
 });
 test("mobile GPU budget preserves live decoder and latency",()=>{
   expect(liveHqBackend({...desktop,mobile:true,width:640,height:360})).toBe("neural");
   expect(liveHqBackend({...desktop,mobile:true,width:854,height:480})).toBe("spatial");
   expect(liveHqBackend({...desktop,mobile:true,width:1280,height:720})).toBe("native");
   expect(liveHqBackend({...desktop,mobile:true,cores:4})).toBe("native");
 });
 test("actual method label never claims neural super-resolution during CSS fallback",()=>{
   expect(visibleLiveHqStatus({enabled:false,neuralActive:true,spatialActive:true})).toBe("off");
   expect(visibleLiveHqStatus({enabled:true,neuralActive:true,spatialActive:true})).toBe("ai-2x");
   expect(visibleLiveHqStatus({enabled:true,neuralActive:false,spatialActive:true})).toBe("spatial");
   expect(visibleLiveHqStatus({enabled:true,neuralActive:false,spatialActive:false})).toBe("native");
   expect(liveHqFilter(true,false)).toContain("contrast(1.025)");
   expect(liveHqFilter(true,true)).toBe("none");
 });
 test("TV HQ falls through neural -> spatial -> hardware decode without restarting stream",()=>{
   const live=readFileSync("src/components/player/LivePlayer.tsx","utf8");
   const css=readFileSync("src/styles/live-hq-adaptive.css","utf8");
   expect(live).toContain('useNeuralVideoUpscaler(');
   expect(live).toContain('neuralCanvasRef,neuralWanted,"movie","live"');
   expect(live).toContain("hqBackend===\"neural\"&&neural.status===\"unavailable\"");
   expect(live).toContain("useVideoEnhancer(videoRef,hqCanvasRef");
   expect(live).toContain("capLevelToPlayerSize=!enabled");
   expect(live).toContain("onLoadedMetadata={measureLiveQuality}");
   expect(live).toContain("setPlaybackSafety:enabled");
   expect(live).toContain("window.setInterval(checkEdge, 1250)");
   expect(live).toContain("engineManagesLatency:true");
   expect(live).not.toContain("setPlayNonce(value => value + 1);\n  }, [hqEnabled]");
   expect(css).toContain(".ydo-live-hq-canvas.is-active");
   expect(css).toContain("pointer-events:none");
 });
 test("live spatial reconstruction uses shader interpolation and deblocking, not CSS alone",()=>{
   const shader=readFileSync("src/components/player/useVideoEnhancer.ts","utf8");
   expect(shader).toContain("export const LIVE_RECONSTRUCT");
   expect(shader).toContain("fract(pixel)");
   expect(shader).toContain("directionalStrength");
   expect(shader).toContain("debanded");
   expect(shader).toContain("gl.texImage2D");
   expect(shader).toContain("live ? 15 : 32");
   expect(shader).toContain("live?8.5:18");
   expect(shader).toContain("frames===(live?8:1)");
 });
 test("live neural budget is lower than VOD and observes dropped decoder frames",()=>{
   const neural=readFileSync("src/components/player/useNeuralVideoUpscaler.ts","utf8");
   expect(neural).toContain('profile: "vod" | "live" = "vod"');
   expect(neural).toContain('profile==="live"?18:22');
   expect(neural).toContain('profile==="live"?250:900');
   expect(neural).toContain("video.getVideoPlaybackQuality");
   expect(neural).toContain("profile!==\"live\"");
 });
});
