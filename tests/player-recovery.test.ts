// tests/player-recovery.test.ts — regression for desktop TV layout and resilient VOD engines.
import { describe, expect, test, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolveVodStreams } from "../src/lib/saimo-stream";

const read = (path:string) => readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});

describe("Player controls without overlap",()=>{
 test("selects layout by the actual video width",()=>{
  const source=read("components/player/LivePlayer.tsx");
  expect(source).toContain('data-controls-density={controlsDensity}');
  expect(source).toContain("new ResizeObserver(sync)");
  expect(source).toContain('width < 440 ? "minimal" : width < 920 ? "compact" : "roomy"');
 });
 test("responsive CSS reserves separate areas for playback and advanced controls",()=>{
  const css=read("styles/tv-mobile-player.css");
  expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
  expect(css).toContain('data-controls-density="compact"');
  expect(css).toContain('data-controls-density="minimal"');
  expect(css).toContain("text-overflow: ellipsis");
  expect(css).toContain("zang-cast-trigger span");
 });
});

describe("VOD movie, series and anime playback",()=>{
 test("uses bundled HLS and MPEGTS engines, no external script dependency",()=>{
  const code=read("components/player/usePlayerEngine.ts");
  expect(code).toContain('import("hls.js")');
  expect(code).toContain('import("mpegts.js")');
  expect(code).not.toContain("https://cdn.jsdelivr.net/npm/hls.js");
  expect(code).not.toContain("https://cdn.jsdelivr.net/npm/mpegts.js");
 });
 test("recognizes a direct HTTP 200 video response from official Saimo as a valid alternative", async()=>{
  const id="99188111";
  globalThis.fetch=(async(input:RequestInfo|URL)=>{
   const url=String(input);
   if(url.includes("saimo-tv.pages.dev/api/stream")) {
    return new Response("video-data",{status:200,headers:{"content-type":"video/mp4"}});
   }
   if(url.includes("fenixflix") || url.includes("redeflix") || url.includes("filmes-")) {
    return new Response("not found",{status:404});
   }
   if(url.includes("/external_ids")) return Response.json({imdb_id:null});
   return new Response("not found",{status:404});
  }) as typeof fetch;
  const sources=await resolveVodStreams({tipo:"movie",id,tmdbId:Number(id),title:"Título de teste sem nome de catálogo"});
  expect(sources.some(s=>s.url.includes("/api/saimo-vod?")&&s.audio==="dub")).toBe(true);
 });
 test("does not suppress IMDb/Fenix fallback when a Saimo link is advertised but fails later",async()=>{
  const id="99188112";
  globalThis.fetch=(async(input:RequestInfo|URL)=>{
   const url=String(input);
   if(url.includes("saimo-tv.pages.dev/api/stream"))
    return new Response(null,{status:302,headers:{Location:"https://cdn.test/video.mp4"}});
   if(url.includes("/external_ids"))return Response.json({imdb_id:"tt99188112"});
   if(url.includes("fenixflix")&&url.includes("tt99188112"))
    return Response.json({streams:[{url:"https://backup.test/movie.mp4",name:"Fenix respaldo"}]});
   return new Response("not found",{status:404});
  }) as typeof fetch;
  const sources=await resolveVodStreams({tipo:"movie",id,tmdbId:Number(id),title:"Filme de teste com fallback"});
  expect(sources.some(s=>s.url.startsWith("/api/saimo-vod"))).toBe(true);
  expect(sources.some(s=>s.url==="https://backup.test/movie.mp4")).toBe(true);
 });
});
