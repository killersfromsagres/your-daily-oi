import {readFileSync} from "node:fs";
import {describe,expect,test} from "bun:test";
import {classifyPicture,createPictureWatchdog,createFrameEvidence,pictureFingerprint,nextPictureSource,rememberPictureSource,forgetPictureSource,prioritizePictureSource,type PictureObservation} from "../src/lib/live-picture-health";
const pixels=(v:number)=>new Uint8ClampedArray(Array.from({length:64},()=>[v,v,v,255]).flat());
const sample=(now:number,extra:Partial<PictureObservation>={})=>({now,mediaTime:now/1000,active:true,dimensions:true,frameCounter:now/10,picture:"black" as const,...extra});
describe("live picture health",()=>{
 test("black pixels versus dark detail and unreadable data",()=>{expect(classifyPicture(pixels(3))).toBe("black");expect(classifyPicture(pixels(25))).toBe("visible");const p=pixels(3);p[0]=100;expect(classifyPicture(p)).toBe("visible");expect(classifyPicture(new Uint8ClampedArray(64))).toBe("unknown");});
 test("requires sustained black while time advances",()=>{const w=createPictureWatchdog();for(let t=0;t<12000;t+=2000)expect(w.observe(sample(t))).toBeNull();expect(w.observe(sample(12000))).toBe("black-picture");});
 test("detects audio only or missing presented frames",()=>{for(const extra of [{dimensions:false,frameCounter:null},{dimensions:true,frameCounter:0}]){const w=createPictureWatchdog();for(let t=0;t<8000;t+=2000)expect(w.observe(sample(t,{picture:"unknown",...extra}))).toBeNull();expect(w.observe(sample(8000,{picture:"unknown",...extra}))).toBe("missing-frames");}});
 test("unknown pixels, normal dark scenes, paused playback and gaps do not trigger black recovery",()=>{const w=createPictureWatchdog();for(let t=0;t<=20000;t+=2000)expect(w.observe(sample(t,{picture:"unknown"}))).toBeNull();w.reset();for(let t=0;t<=20000;t+=2000)expect(w.observe(sample(t,{active:t%4000===0}))).toBeNull();});
 test("independent counters preserve advancing presentation despite a stale decoder counter",()=>{
  const e=createFrameEvidence();expect(e.observe(300,0,null)).toBe(0);expect(e.observe(300,1,null)).toBe(1);
  expect(e.observe(0,2,null)).toBe(2);expect(e.observe(0,2,null)).toBe(2);expect(e.observe(1,2,null)).toBe(3);
 });
 test("changing readable pixels prevent false missing-frame detection when counters are zero",()=>{
  const e=createFrameEvidence(),w=createPictureWatchdog();
  for(let t=0;t<=20000;t+=2000)expect(w.observe(sample(t,{frameCounter:e.observe(0,0,pictureFingerprint(pixels(40+t/1000))),picture:"visible"}))).toBeNull();
  expect(e.observe(0,0,pictureFingerprint(pixels(60)))).toBe(10);
 });
 test("only untried sources in same catalog, including wraparound",()=>{const list=[{url:"one"},{url:"two"},{url:"three"}];expect(nextPictureSource(list,2,new Set(["three"]),new Set(["one"]))).toBe(1);expect(nextPictureSource(list,2,new Set(["three","two"]),new Set(["one"]))).toBeNull();});
 test("verified source preference is channel-scoped, bounded by expiry and removable",()=>{const list=["one","two"];rememberPictureSource("tnt","two",100);expect(prioritizePictureSource("tnt",list,x=>x,200)).toEqual(["two","one"]);expect(prioritizePictureSource("other",list,x=>x,200)).toEqual(list);forgetPictureSource("tnt","two");expect(prioritizePictureSource("tnt",list,x=>x,200)).toEqual(list);});
});

 test("picture monitor belongs to playback effect, never script loader",()=>{
 const code=readFileSync(new URL("../src/components/player/LivePlayer.tsx",import.meta.url),"utf8");
 const loader=code.slice(code.indexOf("async function loadScript"),code.indexOf("async function ensureHls"));
 expect(loader).not.toContain("pictureTimer");expect(loader).not.toContain("pictureWatchdog");
 const effect=code.slice(code.indexOf("// Inicializa a reprodução do stream atual"),code.indexOf("// Source changes and browser/native volume events"));
 expect(effect.match(/const pictureTimer=/g)?.length).toBe(1);
 expect(effect.indexOf("const pictureTimer=")).toBeGreaterThan(effect.indexOf("const onTimeUpdate ="));
 expect(effect.indexOf("window.clearInterval(pictureTimer)")).toBeGreaterThan(effect.indexOf("const pictureTimer="));
 });
