// scripts/inspect-sports-feed.mjs — Bun/Node, inspect live fixture feed schemas for new sports center
const DATE="20261107",DATEISO="2026-11-07";
const leagues=["bra.1","uefa.champions","eng.1","esp.1","ita.1","ger.1","conmebol.libertadores"];
const task=leagues.map(slug=>({slug,url:"https://site.api.espn.com/apis/site/v2/sports/soccer/"+slug+"/scoreboard?dates="+DATE+"&limit=100"}));
for(const slug of ["bra.1","uefa.champions","eng.1","conmebol.libertadores"]){
 task.push({slug:slug+":range",url:"https://site.api.espn.com/apis/site/v2/sports/soccer/"+slug+"/scoreboard?dates=20261107-20261116&limit=150"});
}
task.push({slug:"thesportsdb",url:"https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d="+DATEISO+"&s=Soccer"});
for(const t of task){
 try{
  const r=await fetch(t.url,{signal:AbortSignal.timeout(9500),headers:{Accept:"application/json", "User-Agent":"Mozilla/5.0"}});
  const d=await r.json();
  if(t.slug==="thesportsdb"){
    const rows=(d.events||[]);
    console.log(JSON.stringify({event:"fixture-feed",league:t.slug,status:r.status,total:rows.length,leagues:[...new Set(rows.map(x=>x.strLeague))].slice(0,18),
       examples:rows.slice(0,2).map(x=>({league:x.strLeague,home:x.strHomeTeam,away:x.strAwayTeam,date:x.dateEvent,time:x.strTime,timestamp:x.strTimestamp,TV:x.strTVStation,homeBadge:x.strHomeTeamBadge,keys:Object.keys(x).filter(k=>/Badge|TV|Score|Broadcast|Status|Country/.test(k))}))}));
  }else{
   const rows=d.events||[];
   console.log(JSON.stringify({event:"fixture-feed",league:t.slug,status:r.status,total:rows.length,
    leagues:d.leagues?.map(x=>x.abbreviation).slice(0,2),
    sample:rows.slice(0,3).map(e=>({name:e.name,date:e.date,status:e.status?.type,
      competition:e.competitions?.slice(0,1).map(c=>({date:c.date,broadcasts:c.broadcasts,geoBroadcasts:c.geoBroadcasts,
      teams:c.competitors?.map(x=>({homeAway:x.homeAway,team:x.team?.displayName,id:x.team?.id,logo:x.team?.logo,score:x.score}))}))}))}));
  }
 }catch(err){console.log(JSON.stringify({event:"fixture-feed",league:t.slug,error:String(err).slice(0,170)}))}
}
