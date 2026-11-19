// Public-source diagnostic for the real 18 Nov 2026 Corinthians v Botafogo match.
// Read-only, no tokens, no copyright media download, and never fails CI.
const query=async(url)=>{
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(5500)});
    if(!response.ok)return {status:response.status,body:null};
    return {status:response.status,body:await response.json()};
  }catch(error){return {status:"offline",body:null,reason:error?.name};}
};
const espn=await query("https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event=401841316");
const teams=espn.body?.rosters||[];
console.log(JSON.stringify({probe:"real-match-espn",status:espn.status,
  squads:teams.map(t=>({
    team:t.team?.displayName,id:t.team?.id,
    manager:t.coach?.displayName||t.coaches?.[0]?.displayName||null,
    headshots:t.roster?.filter(p=>!!p.athlete?.headshot).length||0,
    starters:t.roster?.filter(p=>p.starter===true||Number(p.formationPlace)>0).length||0,
    sample:t.roster?.slice(0,3).map(p=>({id:p.athlete?.id,name:p.athlete?.displayName,headshot:!!p.athlete?.headshot})),
  }))}));
for(const team of ["Corinthians","Botafogo"]){
  const search=await query("https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t="+encodeURIComponent(team));
  const options=search.body?.teams||[];
  console.log(JSON.stringify({probe:"sportsdb-team",team,status:search.status,options:options.slice(0,4).map(t=>({
    name:t.strTeam,id:t.idTeam,espn:t.idESPN,country:t.strCountry,sport:t.strSport,
  }))}));
  const selected=options.find(t=>t.strSport==="Soccer" &&
    /brazil|brasil/i.test(t.strCountry||"")&&t.idTeam);
  if(selected){
    const roster=await query("https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id="+selected.idTeam);
    const players=roster.body?.player||roster.body?.players||[];
    console.log(JSON.stringify({probe:"sportsdb-roster",team,status:roster.status,
      count:players.length,withESPN:players.filter(p=>p.idESPN).length,
      withPhoto:players.filter(p=>p.strThumb||p.strCutout).length,
      sample:players.slice(0,3).map(p=>({name:p.strPlayer,hasPhoto:!!(p.strThumb||p.strCutout),idESPN:p.idESPN})),
    }));
  }
}
const search=await query("https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=Hugo%20Souza");
console.log(JSON.stringify({probe:"sportsdb-name",status:search.status,options:
  (search.body?.player||search.body?.players||[]).slice(0,4).map(p=>({
    name:p.strPlayer,team:p.strTeam,espnId:p.idESPN,hasPhoto:!!(p.strThumb||p.strCutout),
  }))}));
