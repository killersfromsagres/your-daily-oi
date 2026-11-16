import {describe,expect,test} from "bun:test";
import {shouldTryTvEdgeBackup,tvEdgeBackupUrl,ZANG_TV_EDGE_ORIGIN} from "../src/lib/tv-edge-backup";

const path="/api/tv/stream?canal=globo-bahia&fonte=0&assinatura=abcdef12";
const base={hostname:"zangflix.vercel.app",mode:"proxy" as const,
  backend:"catalog" as const,proxyPath:path,tried:false};

describe("Vercel-to-owned-Cloudflare live TV network backup",()=>{
 test("only Vercel transport outages trigger a backup",()=>{
  for(const status of [0,502,503,504])
   expect(shouldTryTvEdgeBackup({...base,upstreamStatus:status})).toBe(true);
  for(const status of [undefined,null,200,400,401,403,404,409,410,429])
   expect(shouldTryTvEdgeBackup({...base,upstreamStatus:status})).toBe(false);
 });
 test("never reroute Lovable, a direct CDN, legacy proxies, or a second attempt",()=>{
  expect(shouldTryTvEdgeBackup({...base,hostname:"zangflix.lovable.app",upstreamStatus:502})).toBe(false);
  expect(shouldTryTvEdgeBackup({...base,hostname:"other.example",upstreamStatus:502})).toBe(false);
  expect(shouldTryTvEdgeBackup({...base,mode:"direct",upstreamStatus:502})).toBe(false);
  expect(shouldTryTvEdgeBackup({...base,backend:"legacy",upstreamStatus:502})).toBe(false);
  expect(shouldTryTvEdgeBackup({...base,tried:true,upstreamStatus:502})).toBe(false);
  expect(shouldTryTvEdgeBackup({...base,proxyPath:"/api/live-proxy?url=https://bad.example",upstreamStatus:502})).toBe(false);
 });
 test("uses catalog-indexed signed routes, never arbitrary proxy URLs or credentials",()=>{
  expect(tvEdgeBackupUrl(path)).toBe(ZANG_TV_EDGE_ORIGIN+path);
  expect(tvEdgeBackupUrl("/api/live-proxy?url=https://example.com")).toBeNull();
  expect(tvEdgeBackupUrl("/api/tv/stream?canal=band&fonte=0")).toBeNull();
  expect(tvEdgeBackupUrl(path+"&url=https://example.com")).toBeNull();
  expect(tvEdgeBackupUrl("/api/tv/stream?canal=..%2Fadmin&fonte=0&assinatura=abcdef12")).toBeNull();
 });
});
