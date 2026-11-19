/**
 * Progressive portrait discovery. Three requests at a time keeps 22 starters
 * from overloading a mobile browser, its network and the source API.
 */
type Task={run:()=>Promise<void>};
const cache=new Map<string,{photo:string|null;expires:number}>();
const inFlight=new Map<string,Promise<string|null>>();
const tasks:Task[]=[];
let running=0;
const MAX_ACTIVE=3;
function drain():void {
  while(running<MAX_ACTIVE&&tasks.length){
    const task=tasks.shift()!;
    running++;
    void task.run().finally(()=>{running--;drain();});
  }
}
export function requestMatchPortrait(game:string,person:string,role:"player"|"coach"):Promise<string|null> {
  if(!game||!person)return Promise.resolve(null);
  const key=game+"|"+person+"|"+role;
  const hit=cache.get(key);
  if(hit&&hit.expires>Date.now())return Promise.resolve(hit.photo);
  const current=inFlight.get(key);
  if(current)return current;
  let resolve!: (value:string|null)=>void;
  const promise=new Promise<string|null>(done=>{resolve=done});
  inFlight.set(key,promise);
  tasks.push({run:async()=>{
    let photo:string|null=null;
    try{
      const url="/api/lineup-pessoa?"+new URLSearchParams({jogo:game,pessoa:person,papel:role}).toString();
      const response=await fetch(url,{signal:AbortSignal.timeout(7500),cache:"no-store"});
      if(response.ok){
        const result=await response.json() as {photo?:string|null};
        if(result.photo&&/^https:\/\//.test(result.photo))photo=result.photo;
      }
    }catch{/* Fallback initials remain visible. */}
    if(cache.size>1000)cache.delete(cache.keys().next().value!);
    cache.set(key,{photo,expires:Date.now()+(photo?3600_000:10*60_000)});
    inFlight.delete(key);
    resolve(photo);
  }});
  drain();
  return promise;
}
