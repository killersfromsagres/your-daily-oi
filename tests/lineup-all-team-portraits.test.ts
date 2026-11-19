import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {enrichESPNPortraits,matchDirectoryPlayer,findVerifiedDirectoryTeam,samePerson}
  from "../src/lib/lineup-verified-portraits";
import {verifiedSameFixture,eventManagers,loadVerifiedEventCoaches,matchFixtureClub}
  from "../src/lib/lineup-match-coaches";
import {selectVerifiedSearchPortrait,lookupMatchPersonPhoto}
  from "../src/lib/lineup-lazy-portrait";
import {allowedSportsPortrait,serveLineupPhoto} from "../src/lib/lineup-image-route";
import {getMatchLineups} from "../src/lib/football-lineups";

describe("verified portrait identity and multi-provider resolution",()=>{
  test("cross-provider ESPN ID wins over a stale current club; cannot assign similar names blindly",()=>{
    expect(samePerson("Hugo Souza","123",{idESPN:"123",strPlayer:"Hugo Nogueira de Souza"})).toBe("id");
    expect(samePerson("Hugo Souza","123",{idESPN:"456",strPlayer:"Hugo Souza"})).toBeNull();
    expect(samePerson("Hugo Souza","123",{idESPN:"0",strPlayer:"Hugo Souza"})).toBe("name");
    expect(samePerson("Hugo Souza","123",{strPlayer:"Hugo Nogueira de Souza"})).toBe("name");
    expect(samePerson("Hugo Souza","123",{strPlayer:"Hugo Alberto"})).toBeNull();
    const exact=matchDirectoryPlayer({id:"123",name:"Hugo Souza",photo:null},"Corinthians",[
      {idESPN:"123",strPlayer:"Hugo Nogueira de Souza",strSport:"Soccer",strTeam:"Another Team"},
      {idESPN:"999",strPlayer:"Hugo Souza",strSport:"Soccer",strTeam:"Corinthians"},
    ]);
    expect(exact.match).toBe("id");
  });
  test("verifies team country and ESPN ID rather than first similarly named team",()=>{
    expect(findVerifiedDirectoryTeam({name:"Corinthians",espnTeamId:"874",coach:null,starting:[],substitutes:[]},[
      {idTeam:"112",strTeam:"Corinthians",strCountry:"Portugal",strSport:"Soccer"},
      {idTeam:"133",strTeam:"Sport Club Corinthians Paulista",strCountry:"Brazil",strSport:"Soccer",idESPN:"874"},
    ],"BR")?.idTeam).toBe("133");
  });
  test("lookup all players fills missing ESPN face with a real club roster portrait",async()=>{
    const original=globalThis.fetch;
    const requested:string[]=[];
    globalThis.fetch=(async(input:RequestInfo|URL)=>{
      const url=new URL(String(input));requested.push(url.href);
      if(url.pathname.endsWith("searchteams.php"))return Response.json({teams:[
        {idTeam:"133111",idESPN:"874",strTeam:"Corinthians",strSport:"Soccer",strCountry:"Brazil"},
      ]});
      return Response.json({player:[{idPlayer:"456",idESPN:"923000111",strPlayer:"Hugo Souza",
        strTeam:"Corinthians",strSport:"Soccer",strThumb:"https://r2.thesportsdb.com/images/media/player/thumb/hugo.png"}]});
    }) as typeof fetch;
    try{
      const teams=await enrichESPNPortraits([{
        name:"Corinthians",espnTeamId:"874",coach:null,
        starting:[{id:"923000111",name:"Hugo Souza",photo:"https://a.espncdn.com/i/headshots/soccer/players/full/923000111.png",
          number:"1",position:"Goalkeeper",group:"GOL",grid:null}],substitutes:[],
      }],"BR");
      expect(teams[0]?.starting[0]?.name).toBe("Hugo Souza");
      expect(teams[0]?.starting[0]?.photo).toContain("thesportsdb");
      expect(teams[0]?.starting[0]?.photoFallback).toContain("espncdn");
      expect(requested).toHaveLength(2);
    }finally{globalThis.fetch=original;}
  });
  test("person search requires same club or exact ESPN ID, never a different footballer",()=>{
    const portrait="https://r2.thesportsdb.com/images/media/player/thumb/yes.png";
    expect(selectVerifiedSearchPortrait("2345","Hugo Souza","Corinthians",[
      {idESPN:"2345",strPlayer:"Hugo Nogueira de Souza",strTeam:"Outra equipe",
        strSport:"Soccer",strThumb:portrait},
    ])).toBe(portrait);
    expect(selectVerifiedSearchPortrait("2345","Hugo Souza","Corinthians",[
      {strPlayer:"Hugo Souza",strTeam:"Botafogo",strSport:"Soccer",strThumb:portrait},
    ])).toBeNull();
    expect(selectVerifiedSearchPortrait("2345","Hugo Souza","Corinthians",[
      {strPlayer:"Hugo Souza",strTeam:"Corinthians",strSport:"Soccer",strThumb:portrait},
      {strPlayer:"Hugo Souza",strTeam:"Corinthians",strSport:"Soccer",strThumb:portrait},
    ])).toBeNull();
    expect(selectVerifiedSearchPortrait("2345","Hugo Souza","Corinthians",[
      {strPlayer:"Hugo Souza",strTeam:"Sport Club Corinthians Paulista",strSport:"Soccer",strThumb:portrait},
    ])).toBe(portrait);
  });
});

describe("manager identity verified by exact match and match date",()=>{
  test("rejects another year, wrong opponent or inverted fixture",()=>{
    const event={idEvent:"456123",dateEvent:"2026-11-18",strSport:"Soccer",
      strHomeTeam:"Corinthians",strAwayTeam:"Botafogo"};
    expect(verifiedSameFixture(event,"Corinthians","Botafogo","2026-11-18")).toBe(true);
    expect(verifiedSameFixture(event,"Corinthians","Botafogo","2025-11-18")).toBe(false);
    expect(verifiedSameFixture(event,"Botafogo","Corinthians","2026-11-18")).toBe(false);
    expect(matchFixtureClub("Sport Club Corinthians Paulista","Corinthians")).toBe(true);
  });
  test("only confirmed manager rows enter the coach card",()=>{
    const values=eventManagers([
      {strPlayer:"Treinador A",strPosition:"Manager",strHome:"Yes",strTeam:"Corinthians"},
      {strPlayer:"Treinador B",strPosition:"Head Coach",strHome:"No",strTeam:"Botafogo",
        strThumb:"https://r2.thesportsdb.com/images/coach.png"},
      {strPlayer:"Jogador X",strPosition:"Forward",strHome:"Yes"},
    ],"Corinthians","Botafogo");
    expect(values.get("home")?.name).toBe("Treinador A");
    expect(values.get("away")?.photo).toContain("coach.png");
    expect(eventManagers([
      {strPlayer:"A",strPosition:"Manager",strHome:"Yes"},
      {strPlayer:"B",strPosition:"Manager",strHome:"Yes"},
    ],"Corinthians","Botafogo").has("home")).toBe(false);
  });
});

describe("hardened same-origin ESPN / sports CDN portraits",()=>{
  test("prevents arbitrary URLs, redirects and SSRF",()=>{
    expect(allowedSportsPortrait("https://a.espncdn.com/i/headshots/soccer/players/full/123.png")?.hostname).toBe("a.espncdn.com");
    expect(allowedSportsPortrait("https://r2.thesportsdb.com/images/people/123.png")?.hostname).toBe("r2.thesportsdb.com");
    expect(allowedSportsPortrait("https://127.0.0.1/private")).toBeNull();
    expect(allowedSportsPortrait("http://a.espncdn.com/i/headshots/soccer/players/full/123.png")).toBeNull();
    expect(allowedSportsPortrait("https://a.espncdn.com.evil.com/i/headshots/soccer/players/full/123.png")).toBeNull();
    expect(allowedSportsPortrait("https://a.espncdn.com/private/keys")).toBeNull();
    expect(allowedSportsPortrait("https://user:pass@a.espncdn.com/i/headshots/soccer/players/full/12.png")).toBeNull();
  });
  test("passes only small real images, with cache; rejects non-images",async()=>{
    const original=globalThis.fetch;
    globalThis.fetch=(async()=>new Response(new Uint8Array(400),{
      status:200,headers:{"content-type":"image/png","content-length":"400"},
    })) as typeof fetch;
    try{
      const res=await serveLineupPhoto("https://a.espncdn.com/i/headshots/soccer/players/full/123.png");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(res.headers.get("Cache-Control")).toContain("max-age");
    }finally{globalThis.fetch=original;}
  });
});

describe("visible all-match progressive photos and glass style",()=>{
  test("source, lazy fallback and per-fixture image route are wired",()=>{
    const modal=readFileSync("src/components/sports/MatchLineups.tsx","utf8");
    const ui=readFileSync("src/components/sports/TeamLineupBoard.tsx","utf8");
    const server=readFileSync("src/server.ts","utf8");
    expect(modal).toContain("<TeamLineupBoard team={selected} gameId={game.id}/>");
    expect(ui).toContain("requestMatchPortrait(gameId,personId,role)");
    expect(ui).toContain('"/api/lineup-foto?u="');
    expect(ui).toContain('data-portrait={loaded?"real":"fallback"}');
    expect(ui).toContain('role="coach"');
    expect(server).toContain('url.pathname === "/api/lineup-foto"');
    expect(server).toContain('url.pathname === "/api/lineup-pessoa"');
  });
  test("modal and field are visibly translucent, blur limited for mobile and TV",()=>{
    const css=readFileSync("src/styles/lineup-glass-premium.css","utf8");
    expect(css).toContain("rgba(9,75,58,.74)");
    expect(css).toContain("backdrop-filter:blur(14px)");
    expect(css).toContain(".zf-formation-coach");
    expect(css).toContain(".zf-formation-bench");
    expect(css).toContain("rgba(26,112,75,.76)");
    expect(css).toContain("html[data-zf-platform=\"tv\"]");
  });
});
