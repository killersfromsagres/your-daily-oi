import {describe,expect,test} from "bun:test";
import {clampVolume,stepVolume} from "../src/lib/live-volume";
import {liveCastCandidates} from "../src/lib/cast-source";
import {remoteKey} from "../src/lib/tv-remote";
import {detectDeviceProfile} from "../src/lib/device-profile";
import {parseFootballTvGuide,guideNamesForFixture} from "../src/lib/football-tv-guide";
import type {FonteTV} from "../src/lib/canais";

describe("Live audio",()=>{
 test("clamps persisted and requested volume without NaN or out-of-range playback errors",()=>{
  for(const value of [null,undefined,"",NaN,"garbage"])expect(clampVolume(value)).toBe(1);
  expect(clampVolume("0.35")).toBe(.35);expect(clampVolume(-2)).toBe(0);expect(clampVolume(5)).toBe(1);
  expect(stepVolume(.98,1)).toBe(1);expect(stepVolume(.01,-1)).toBe(0);expect(stepVolume(.35,1)).toBe(.4);
 });
});
describe("Receiver source selection",()=>{
 const hls:FonteTV={url:"https://cdn.example/live.m3u8"},mp4:FonteTV={url:"https://cdn.example/live.mp4"};
 test("uses the origin's CORS media route and falls back within the same channel",()=>{
  const candidates=liveCastCandidates({origin:"https://zangflix.vercel.app",channelId:"sportv",source:hls,streamUrl:hls.url,sources:[hls,mp4]});
  expect(candidates[0]?.url).toContain("https://zangflix.vercel.app/api/tv/stream?canal=sportv");
  expect(candidates[0]?.mime).toBe("application/x-mpegURL");expect(candidates.at(-1)?.mime).toBe("video/mp4");
 });
 test("never sends a raw TS file or a ClearKey-protected source to the default receiver",()=>{
  const ts:FonteTV={url:"https://cdn.example/channel.ts"},protectedSource:FonteTV={url:"https://cdn.example/protected.mpd",chave:"key"};
  const candidates=liveCastCandidates({origin:"https://zangflix.vercel.app",channelId:"band",source:ts,streamUrl:"blob:https://zangflix.vercel.app/123",sources:[ts,protectedSource,mp4]});
  expect(candidates).toHaveLength(1);expect(candidates[0]?.mime).toBe("video/mp4");
  expect(candidates[0]?.url).not.toContain("blob:");
 });
});
describe("TV remote",()=>{
 test("normalizes Samsung, LG, Android Select and media keys",()=>{
  expect(remoteKey({key:"Unidentified",keyCode:10009})).toBe("BrowserBack");expect(remoteKey({key:"Unidentified",keyCode:461})).toBe("BrowserBack");
  expect(remoteKey({key:"Unidentified",keyCode:37})).toBe("ArrowLeft");
  expect(remoteKey({key:"Unidentified",keyCode:23})).toBe("Enter");expect(remoteKey({key:"ArrowRight",keyCode:39})).toBe("ArrowRight");
  expect(remoteKey({key:"Unidentified",keyCode:10252})).toBe("MediaPlayPause");
 });
 test("native TV and the user's explicit TV mode win over phone-sized viewports",()=>{
  expect(detectDeviceProfile({userAgent:"Android ZangFlixTV/1.1",viewportWidth:960,coarsePointer:false,touchPoints:0})).toBe("tv");
  expect(detectDeviceProfile({userAgent:"Chrome",viewportWidth:960,coarsePointer:false,touchPoints:0,tvMode:true})).toBe("tv");
 });
});
describe("Automated Brazilian broadcast research",()=>{
 const start="2026-11-14T18:00:00Z",ts=Date.parse(start)/1000;
 const html=`<article class="match" data-ts="${ts}"><span class="m-name">Brasil</span><span class="m-name">Japão</span><div class="m-channels"><span><b>SPORTV</b></span><span><b>GE TV</b></span></div></article>`;
 test("extracts only explicitly listed broadcasters and identifies the exact fixture",()=>{
  const rows=parseFootballTvGuide(html,"https://www.futebolnatv.com.br/jogos-amanha/");
  expect(rows).toHaveLength(1);expect(rows[0]?.dataLocal).toBe("2026-11-14");
  expect(guideNamesForFixture({casa:"Brazil",fora:"Japan",inicioIso:start,dataLocal:"2026-11-14"},rows)).toEqual(["SPORTV","GE TV"]);
 });
 test("never reuses a league carrier or a different day, opponent, category or kickoff",()=>{
  const rows=parseFootballTvGuide(html,"https://example.com");
  for(const game of [{casa:"Brasil",fora:"Japão Feminino",inicioIso:start,dataLocal:"2026-11-14"},
   {casa:"Brasil",fora:"Japão",inicioIso:start,dataLocal:"2026-11-15"},
   {casa:"Brasil",fora:"Japão",inicioIso:"2026-11-14T21:00:00Z",dataLocal:"2026-11-14"}])expect(guideNamesForFixture(game,rows)).toEqual([]);
  expect(parseFootballTvGuide('<article class="match"><span class="m-name">Brasil</span></article>',"https://example.com")).toEqual([]);
 });
});
