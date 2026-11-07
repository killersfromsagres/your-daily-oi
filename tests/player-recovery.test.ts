// tests/player-recovery.test.ts — regression for desktop TV layout and resilient VOD engines.
import { describe, expect, test, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolveVodStreams } from "../src/lib/saimo-stream";

const read = (path:string) => readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});

describe("Player controls without overlap",()=>{
 test("uses a single lightweight toolbar instead of parallel legacy controls",()=>{
  const source=read("components/player/LivePlayer.tsx");
  expect(source).toContain('className={"zf-player-toolbar"');
  expect(source).not.toContain('data-controls-density={controlsDensity}');
  expect(source).not.toContain('className="ydo-live-mobile-fullscreen"');
  expect(source).toContain('aria-label="Qualidade e ajustes de reprodução"');
 });
 test("button geometry is intrinsic and identical across web and mobile",()=>{
  const css=read("styles/live-controls-minimal.css");
  expect(css).toContain("flex-flow: row nowrap");
  expect(css).toContain("max-width: 100%");
  expect(css).toContain("flex: 0 0 var(--zf-toolbar-icon)");
  expect(css).toContain("width: var(--zf-toolbar-icon)");
  expect(css).toContain("--zf-toolbar-icon: 30px");
  expect(css).toContain(".zf-player-menu");
 });
});

describe("VOD movie, series and anime playback",()=>{
 test("uses bundled HLS and MPEGTS engines, no external script dependency",()=>{
  const code=read("components/player/usePlayerEngine.ts");
  expect(code).toContain('import("hls.js")');
  expect(code).toContain('import("mpegts.js")');
  expect(code).not.toContain("https://cdn.jsdelivr.net/npm/hls.js");
  expect(code).not.toContain("https://cdn.jsdelivr.net/npm/mpegts.js");
  // Switching episodes while an engine is being imported must not let an
  // obsolete stream reattach to the new video.
  expect(code).toContain("const Hls = await ensureHls();\n          if (cancelled) return;");
  expect(code).toContain("const mpegts = await ensureMpegts();\n          if (cancelled) return;");
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
