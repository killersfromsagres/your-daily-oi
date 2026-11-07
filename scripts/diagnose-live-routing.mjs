// scripts/diagnose-live-routing.mjs — Bun; no full media transfers. Check production routes and build identity.
const base="https://zangflix.vercel.app";
const routes=[
 "/tv","/api/version","/api/canais","/api/live-proxy","/api/proxy",
 "/api/live-format?canal=band&fonte=0",
 "/api/tv/stream?canal=%21&fonte=0",
 "/api/tv/stream?canal=not-a-real-channel&fonte=0",
 "/api/tv/stream?canal=band&fonte=0",
 "/api/integrations/status",
];
await Promise.all(routes.map(async path=>{
 try{
  const res=await fetch(base+path,{signal:AbortSignal.timeout(9000),headers:{"Range":"bytes=0-512","Accept":"*/*"},redirect:"manual"});
  const mime=res.headers.get("content-type")||"";
  const isText=/json|text|html|mpegurl/.test(mime);
  let sample="";
  if(isText){
   try{
    const reader=res.body?.getReader();
    if(reader){
      const {value}=await reader.read();
      sample=new TextDecoder().decode(value||new Uint8Array()).slice(0,500).replace(/\s+/g," ");
      await reader.cancel();
    }
   }catch{}
  }else await res.body?.cancel();
  console.log(JSON.stringify({path,status:res.status,mime,server:res.headers.get("server"),vercelId:res.headers.get("x-vercel-id"),cache:res.headers.get("cache-control"),
    isStudio:path==="/tv"?sample.includes("ztv-studio"):null,sample}));
 }catch(e){console.log(JSON.stringify({path,error:e?.cause?.code||e?.name||"fetch"}));}
}));
