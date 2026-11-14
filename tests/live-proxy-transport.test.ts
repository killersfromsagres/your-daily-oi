import {describe,expect,test} from "bun:test";
import {isLiveHlsMime,liveMediaHeaders,isContinuousTs,finiteLiveBody} from "../src/lib/live-proxy-transport";
describe("live HTTP proxy transport",()=>{
 test("drops unverified Content-Length and content encoding on binary media",()=>{
   const h=liveMediaHeaders(new Headers({"content-type":"video/mp2t","content-length":"70000","content-encoding":"gzip"}),200);
   expect(h.get("content-length")).toBeNull();
   expect(h.get("content-encoding")).toBeNull();
   expect(h.get("accept-ranges")).toBeNull();
   expect(h.get("access-control-allow-origin")).toBe("*");
 });
 test("preserves 206 Content-Range but not unverified length",()=>{
   const h=liveMediaHeaders(new Headers({"content-range":"bytes 0-10/500","content-length":"12","content-type":"video/mp4"}),206);
   expect(h.get("content-range")).toBe("bytes 0-10/500");
   expect(h.get("content-length")).toBeNull();
   expect(h.get("accept-ranges")).toBe("bytes");
 });
 test("recognizes common HLS application and audio types",()=>{
   for(const mime of ["application/x-mpegurl","application/vnd.apple.mpegurl","audio/x-mpegurl","application/mpegurl; charset=utf-8"])
     expect(isLiveHlsMime(mime)).toBe(true);
   expect(isLiveHlsMime("video/mp2t")).toBe(false);
 });
 test("caps only endless TS streams, not ranged HLS fragments",()=>{
   const r=new Response(new Uint8Array([1]),{headers:{"content-type":"video/mp2t"}});
   expect(isContinuousTs(r,null)).toBe(true);
   expect(isContinuousTs(r,"bytes=0-5")).toBe(false);
   expect(isContinuousTs(new Response("a",{status:206,headers:{"content-type":"video/mp2t"}}),null)).toBe(false);
 });
 test("cleanly closes an idle transport before the function's deadline",async()=>{
   const source=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array([1,2]));}});
   const reader=finiteLiveBody(source,25).getReader();
   expect((await reader.read()).value).toEqual(new Uint8Array([1,2]));
   expect((await reader.read()).done).toBe(true);
 });
});
