import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {tvFailureMessage,tvPlaybackPlan,tvSkipSameSource} from "../src/lib/tv-playback-plan";
import type {CanalTV} from "../src/lib/canais";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const channel:CanalTV={id:"teste",nome:"Canal Teste",categoria:"Documentários",fontes:[
 {url:"https://cdn.example.org/live.m3u8"},
 {url:"https://cdn2.example.org/live.m3u8"},
]};
describe("TCL live player — bounded recovery",()=>{
 test("each known source has safe finite direct and first-party proxy attempts",()=>{
  const attempts=tvPlaybackPlan(channel);
  expect(attempts.length).toBeGreaterThan(1);
  expect(attempts.length).toBeLessThanOrEqual(9);
  expect(attempts.some(a=>a.mode==="catalog")).toBe(true);
  expect(attempts.some(a=>a.mode==="direct")).toBe(true);
  expect(attempts.every(a=>a.format==="hls")).toBe(true);
 });
 test("authorization refusals aren't bypassed and status is explained",()=>{
  expect(tvSkipSameSource(403)).toBe(true);
  expect(tvSkipSameSource(401)).toBe(true);
  expect(tvSkipSameSource(409)).toBe(false);
  expect(tvFailureMessage("network",403)).toContain("403");
  expect(tvFailureMessage("timeout")).toContain("Tempo limite");
 });
 test("player is isolated, bounded and never loops on exhausted sources",()=>{
  const app=read("../src/routes/tv-live.tsx");
  const player=read("../src/components/player/TvStreamPlayer.tsx");
  expect(app).toContain("TvStreamPlayer key={active.id}");
  expect(app).not.toContain("<LivePlayer");
  expect(app).toContain("onPlaybackStatus={onPlaybackStatus}");
  expect(player).toContain("data-tv-native-stream");
  expect(player).toContain("if(!plan.length)");
  expect(player).toContain('report("unavailable")');
  expect(player).toContain("window.setTimeout");
  expect(player).toContain("void video.play()");
 });
});
