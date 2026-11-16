// Live source availability across user's own Lovable and Vercel deployments.
// Never logs upstream URLs, credentials, or response payloads.
const sites={lovable:"https://zangflix.lovable.app",vercel:"https://zangflix.vercel.app"};
const picked=["band","sbt","tv-camara","globo-bahia","tv-cultura","record","espn","sportv","tnt-series","telecine-premium","discovery-channel","cnn-brasil","bandnews","tv-senado","redevida","rede-tv"];
const limit=4;
const task=async(site,base,channel,index)=>{
 const start=Date.now();
 const params=new URLSearchParams({canal:channel.id,fonte:String(index)});
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9500);
 try{
  const r=await fetch(base+"/api/tv/stream?"+params,{redirect:"manual",headers:{Accept:"application/vnd.apple.mpegurl, application/dash+xml, */*"},signal:controller.signal});
  const mime=(r.headers.get("content-type")||"").split(";")[0];
  let prefix="";
  if(r.ok && r.body){
   try{
    const reader=r.body.getReader();
    const result=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error("first byte timeout")),2500))]);
    if(result?.value)prefix=new TextDecoder().decode(result.value.slice(0,96)).trimStart();
    void reader.cancel().catch(()=>{});
   }catch{}
  } else void r.body?.cancel().catch(()=>{});
  console.log(JSON.stringify({event:"media-probe",site,channel:channel.id,source:index,http:r.status,mime,hls:prefix.startsWith("#EXTM3U"),mpd:prefix.startsWith("<?xml")||prefix.startsWith("<MPD"),ms:Date.now()-start}));
 }catch(e){console.log(JSON.stringify({event:"media-probe",site,channel:channel.id,source:index,error:e?.name||"error",ms:Date.now()-start}));}
 finally{clearTimeout(timer);}
};
for(const [site,base] of Object.entries(sites)){
 let list=[];
 try{
  const response=await fetch(base+"/api/canais",{signal:AbortSignal.timeout(12000)});
  const data=await response.json();
  list=Array.isArray(data.canais)?data.canais:[];
 }catch(e){console.log(JSON.stringify({event:"catalog-error",site,error:e?.name}));continue;}
 console.log(JSON.stringify({event:"catalog-size",site,channels:list.length}));
 const selected=picked.map(id=>list.find(ch=>ch.id===id)||list.find(ch=>ch.id.startsWith(id+"-"))).filter(ch=>ch?.fontes?.length);
 for(let i=0;i<selected.length;i+=limit){
  const batch=selected.slice(i,i+limit);
  await Promise.all(batch.flatMap(ch=>Array.from({length:Math.min(ch.fontes.length,2)},(_,idx)=>task(site,base,ch,idx))));
 }
}
