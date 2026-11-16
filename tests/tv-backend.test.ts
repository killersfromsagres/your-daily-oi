import {describe,expect,test} from "bun:test";
import {detectTvProxyBackend} from "../src/lib/tv-backend";

describe("TV backend detection across Vercel cold starts",()=>{
 test("prefers catalog route when responding with expected validation JSON",async()=>{
   const calls:string[]=[];
   const fake=(async (url:string)=>{
     calls.push(url);
     return new Response(JSON.stringify({error:"Canal ou fonte inválidos"}),{status:400,headers:{"content-type":"application/json"}});
   }) as typeof fetch;
   expect(await detectTvProxyBackend(fake,30)).toBe("catalog");
   expect(calls).toHaveLength(1);
 });
 test("falls back to legacy with a FRESH abort signal after modern times out",async()=>{
   const signals:AbortSignal[]=[];
   const fake=(async (url:string,options?:RequestInit)=>{
     signals.push(options!.signal as AbortSignal);
     if(url.includes("/tv/stream"))return new Promise<Response>((_,reject)=>{
       options!.signal!.addEventListener("abort",()=>reject(new Error("aborted")),{once:true});
     });
     return new Response("URL ausente",{status:400});
   }) as typeof fetch;
   expect(await detectTvProxyBackend(fake,15)).toBe("legacy");
   expect(signals).toHaveLength(2);
   expect(signals[0].aborted).toBe(true);
   expect(signals[1].aborted).toBe(false);
 });
 test("does not report an error page as a working proxy",async()=>{
   const fake=(async()=>new Response("<html>error</html>",{status:200,headers:{"content-type":"text/html"}})) as typeof fetch;
   expect(await detectTvProxyBackend(fake,30)).toBe("unavailable");
 });
 test("will recover on a subsequent call when the cold Vercel function warms",async()=>{
   let up=false;
   const fake=(async (url:string)=>{
     if(!up)return new Response("temporarily unavailable",{status:503});
     return url.includes("tv/stream")
       ?new Response(JSON.stringify({error:"invalid"}),{status:400,headers:{"content-type":"application/json"}})
       :new Response("URL ausente",{status:400});
   }) as typeof fetch;
   expect(await detectTvProxyBackend(fake,30)).toBe("unavailable");
   up=true;
   expect(await detectTvProxyBackend(fake,30)).toBe("catalog");
 });
});
