import {describe,expect,test} from "bun:test";
import {tvCatalogCacheTtl} from "../src/lib/canais";
import {classifyHTTP} from "../scripts/lib/tv-audit-classify.mjs";
describe("TV outage diagnostics",()=>{
 test("metadata-only and partial provider responses retry within one minute",()=>{
  expect(tvCatalogCacheTtl(2,2,true)).toBe(600000);
  expect(tvCatalogCacheTtl(2,1,true)).toBe(60000);
  expect(tvCatalogCacheTtl(2,0,false)).toBe(60000);
  expect(tvCatalogCacheTtl(2,2,false)).toBe(60000);
 });
 test("manifest MIME and nonstandard 218 are not proof of media",()=>{
  expect(classifyHTTP(200,"HLS","not a playlist")).toBe("invalid-or-incomplete-manifest");
  expect(classifyHTTP(218,"HLS","#EXTM3U\n#EXT-X-VERSION:3")).toBe("unconfirmed-http-status");
  expect(classifyHTTP(206,"HLS","#EXTM3U\n#EXT-X-VERSION:3")).toBe("manifest-candidate");
  expect(classifyHTTP(200,"DASH",'<?xml version="1.0"?><MPD type="dynamic">')).toBe("manifest-candidate");
  expect(classifyHTTP(403,"HLS","")).toBe("access-denied");
  expect(classifyHTTP(200,"HLS","<html>Denied</html>")).toBe("html-not-video");
 });
});
