// scripts/diagnose-football-now.mjs — inspect production agenda latency and ESPN real lineup schema.
const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const d=date.replaceAll("-","");
async function inspect(name,url,timeout=12000){
 const started=Date.now();
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});
  const payload=await r.json();
  let sample;
  if(name==="zang"){
   sample={total:payload?.jogos?.length,parcial:payload?.parcial,erro:payload?.erro,fontes:payload?.fontesConsultadas,
     unavailable:payload?.ligasIndisponiveis,first:payload?.jogos?.slice(0,2).map(x=>({id:x.id,casa:x.casa,fora:x.fora,canal:x.canalNome}))};
  }else{
   const events=payload?.events||[];
   sample={events:events.length,ids:events.slice(0,3).map(x=>x.id)};
  }
  console.log(JSON.stringify({name,date,http:r.status,ms:Date.now()-started,sample}));
  return name!=="zang"?(payload?.events||[])[0]?.id:null;
 }catch(e){console.log(JSON.stringify({name,date,error:String(e),ms:Date.now()-started}));return null;}
}
for(const dIso of [date, new Date(Date.parse(date+"T12:00:00Z")+86400000).toISOString().slice(0,10)]){
 try {
 const started=Date.now(), endpoint="https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d="+dIso+"&s=Soccer";
 const response=await fetch(endpoint,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});
 const data=await response.json();
 console.log(JSON.stringify({name:"sportsdb",date:dIso,http:response.status,ms:Date.now()-started,
 count:data.events?.length??0,sample:data.events?.slice(0,2).map(e=>({id:e.idEvent,home:e.strHomeTeam,away:e.strAwayTeam,date:e.dateEvent,utc:e.strTimestamp,league:e.strLeague,leagueId:e.idLeague,tv:e.strTVStation,keys:Object.keys(e).filter(k=>/Photo|Badge|Thumb|Poster|TV|League/.test(k)).slice(0,15)}))}));
 }catch(e){console.log(JSON.stringify({name:"sportsdb",date:dIso,error:String(e)}));}
}
for(const id of ["2442829","1032723"]){
 for(const endpoint of ["lookuplineup","lookuptv"]){
  try{
    const response=await fetch("https://www.thesportsdb.com/api/v1/json/123/"+endpoint+".php?id="+id,{signal:AbortSignal.timeout(5000)});
    const payload=await response.json();
    const entries=Object.entries(payload).map(([key,value])=>({key,count:Array.isArray(value)?value.length:null,sample:Array.isArray(value)?value.slice(0,2):value}));
    console.log(JSON.stringify({name:"sportsdb-"+endpoint,id,status:response.status,entries}).slice(0,4300));
  }catch(error){console.log(JSON.stringify({name:"sportsdb-"+endpoint,id,error:String(error)}));}
 }
}
const league="bra.1";
const id=await inspect("espn-bra",`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${d}&limit=120`);
await inspect("zang",`https://zangflix.vercel.app/api/jogos-agenda?data=${date}`,30000);
if(id){
 const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${id}`;
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(9500)});
  const x=await r.json();const list=x.rosters?.map(z=>({team:z.team?.displayName,keys:Object.keys(z),
   players:z.roster?.slice(0,2).map(p=>({keys:Object.keys(p),athlete:p.athlete,position:p.position,formationPlace:p.formationPlace,starter:p.starter})),
   coach:z.coach||z.coaches}));
  console.log(JSON.stringify({name:"summary",http:r.status,eventId:id,keys:Object.keys(x),rosters:list,form:x.boxscore?.form?.slice(0,2)}).slice(0,5500));
 }catch(e){console.log(JSON.stringify({name:"summary",error:String(e)}))}
}
