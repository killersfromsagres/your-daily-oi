import {describe,expect,test} from "bun:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {enrichKnownLineupPhotos,photoFromSportsDbRecord,providerPhoto} from "../src/lib/lineup-photo-source";
import {enrichSportsDbMatchPhotos,parseSportsDbLineups,parseESPNLineups} from "../src/lib/football-lineups";
import {lineupEvidence} from "../src/lib/lineup-evidence";
import {TeamLineupBoard} from "../src/components/sports/TeamLineupBoard";
import type {LineupPlayer,LineupTeam,MatchLineups} from "../src/lib/football-lineups";

const person=(id:number,position:string,photo:string|null=null):LineupPlayer=>({
  id:String(id),name:"Atleta "+id,number:String(id),
  position,group:position==="Goalkeeper"?"GOL":"DEF",photo,grid:null,
});
const fullTeam:LineupTeam={
  name:"Equipe 1",formation:"4-3-3",crest:null,
  coach:{name:"Treinador real",photo:"https://r2.thesportsdb.com/images/manager.png"},
  starting:Array.from({length:11},(_,i)=>person(i+1,i===0?"Goalkeeper":"Defender",
    i===0?"https://a.espncdn.com/i/headshots/soccer/players/full/12345.png":null)),
  substitutes:[person(99,"Forward","https://r2.thesportsdb.com/images/sub.png")],
};
const payload:MatchLineups={jogo:"bra.1:12345",atualizadoEm:"2026-11-18T22:42:00Z",
  origem:"ESPN",completa:true,disponivel:true,equipes:[fullTeam],mensagem:"Escalações disponíveis."};

describe("lineup photo integrity",()=>{
  test("only accepts HTTPS portraits from the given provider, not guessed names or injected paths",()=>{
    expect(providerPhoto("https://r2.thesportsdb.com/headshot.png")).toContain("thesportsdb");
    expect(providerPhoto("http://insecure.example/a.png")).toBeNull();
    expect(providerPhoto("javascript:alert(1)")).toBeNull();
    expect(providerPhoto("https://user:password@a.espncdn.com/headshot.png")).toBeNull();
    expect(photoFromSportsDbRecord({strCutout:"https://r2.thesportsdb.com/cut.png",strThumb:"https://r2.thesportsdb.com/thumb.png"}))
      .toContain("thumb.png");
  });
  test("bounded lookup uses the exact published ID, leaves name and position untouched",async()=>{
    const realFetch=globalThis.fetch;
    const urls:string[]=[];
    globalThis.fetch=(async(input:RequestInfo|URL)=>{
      urls.push(String(input));
      const id=new URL(String(input)).searchParams.get("id")!;
      return Response.json({players:[{
        idPlayer:id,strPlayer:"Different provider display name",strSport:"Soccer",
        strThumb:"https://r2.thesportsdb.com/athletes/"+id+".png",
      }]});
    }) as typeof fetch;
    try{
      const found=await enrichKnownLineupPhotos([
        {id:"923800171",hasPhoto:false},{id:"923800172",hasPhoto:true},
        {id:"similar-name",hasPhoto:false},
        {id:"923800173",hasPhoto:false},
      ],2);
      expect(found.size).toBe(2);
      expect(urls).toHaveLength(2);
      expect(urls.every(x=>x.includes("lookupplayer.php?id="))).toBe(true);
      expect(urls.some(x=>x.endsWith("923800172"))).toBe(false);
      expect(found.get("923800171")).toContain("923800171.png");
    }finally{globalThis.fetch=realFetch;}
  });
  test("coach with a real TheSportsDB ID gains a photo without changing the identity",async()=>{
    const realFetch=globalThis.fetch;
    globalThis.fetch=(async(input:RequestInfo|URL)=>{
      const id=new URL(String(input)).searchParams.get("id")!;
      return Response.json({players:[{idPlayer:id,strSport:"Soccer",
        strCutout:"https://r2.thesportsdb.com/person/"+id+".png"}]});
    }) as typeof fetch;
    try{
      const parsed=parseSportsDbLineups("sportsdb:987654321",[
        {idPlayer:"923811100",strPlayer:"Goleiro Certo",strHome:"Yes",strTeam:"Casa",
          strPosition:"Goalkeeper",strSubstitute:"No"},
        {idPlayer:"923811101",strPlayer:"Técnico Certo",strHome:"Yes",strTeam:"Casa",
          strPosition:"Manager",strSubstitute:"No"},
      ]);
      const enriched=await enrichSportsDbMatchPhotos(parsed);
      expect(enriched.equipes[0]?.starting[0]?.name).toBe("Goleiro Certo");
      expect(enriched.equipes[0]?.starting[0]?.position).toBe("Goalkeeper");
      expect(enriched.equipes[0]?.starting[0]?.photo).toContain("923811100.png");
      expect(enriched.equipes[0]?.coach?.name).toBe("Técnico Certo");
      expect(enriched.equipes[0]?.coach?.photo).toContain("923811101.png");
    }finally{globalThis.fetch=realFetch;}
  });
  test("reversed ESPN boxscore form order never swaps coaches between teams",()=>{
    const data=parseESPNLineups("bra.1:12345",{
      rosters:[
        {team:{id:"11",displayName:"Casa"},roster:[]},
        {team:{id:"22",displayName:"Fora"},roster:[]},
      ],
      boxscore:{form:[
        {team:{id:"22",displayName:"Fora"},formation:"5-3-2",
          coach:{displayName:"Técnico Visitante",headshot:{href:"https://a.espncdn.com/away.png"}}},
        {team:{id:"11",displayName:"Casa"},formation:"4-4-2",
          coach:{displayName:"Técnico Mandante",headshot:{href:"https://a.espncdn.com/home.png"}}},
      ]},
    });
    expect(data.equipes[0]?.coach?.name).toBe("Técnico Mandante");
    expect(data.equipes[0]?.coach?.photo).toBe("https://a.espncdn.com/home.png");
    expect(data.equipes[0]?.formation).toBe("4-4-2");
    expect(data.equipes[1]?.coach?.name).toBe("Técnico Visitante");
    expect(data.equipes[1]?.formation).toBe("5-3-2");
  });
  test("unknown form team never assigns another team's manager",()=>{
    const data=parseESPNLineups("bra.1:12345",{
      rosters:[{team:{id:"11",displayName:"Casa"},roster:[]}],
      boxscore:{form:[{team:{id:"99",displayName:"Outra Equipe"},
        coach:{displayName:"Técnico Errado"}}]},
    });
    expect(data.equipes[0]?.coach).toBeNull();
  });
  test("ESPN headshot from the actual roster is used for the correct athlete",()=>{
    const data=parseESPNLineups("bra.1:12345",{rosters:[{
      team:{displayName:"Casa"},roster:[{
        athlete:{id:"400501",displayName:"Goleiro Real",headshot:{href:"https://a.espncdn.com/headshot-real.png"}},
        position:{name:"Goalkeeper"},starter:true,
      }],coaches:[{displayName:"Técnico Real",
        headshot:{href:"https://a.espncdn.com/coach-real.png"}}],
    }]});
    expect(data.equipes[0]?.starting[0]?.photo).toBe("https://a.espncdn.com/headshot-real.png");
    expect(data.equipes[0]?.coach?.photo).toBe("https://a.espncdn.com/coach-real.png");
  });
});

describe("evidence-driven lineup precision",()=>{
  test("11 published names never become an unjustified claim of official confirmation",()=>{
    const evidence=lineupEvidence(payload,fullTeam,{source:"sectors"});
    expect(evidence.label).toBe("11 titulares publicados");
    expect(evidence.tacticalLabel).toContain("agrupadas");
    expect(evidence.detail).toContain("não equivale a uma confirmação oficial");
    expect(evidence.updatedLabel).toContain("Consultado");
    expect(evidence.source).toBe("ESPN");
  });
  test("partial formation is never marked as a confirmed XI",()=>{
    const half={...fullTeam,starting:fullTeam.starting.slice(0,7)};
    expect(lineupEvidence(payload,half,{source:"grid"}).status).toBe("partial");
    expect(lineupEvidence(payload,half,{source:"formation"}).tacticalLabel).toContain("compatível");
    expect(lineupEvidence(null,null,null).label).toBe("Escalação não divulgada");
  });
  test("real portraits appear as circles on pitch, coach and substitute bench",()=>{
    const markup=renderToStaticMarkup(createElement(TeamLineupBoard,{team:fullTeam}));
    expect(markup).toContain('class="zf-formation-player"');
    expect(markup).toContain("Foto de Atleta 1");
    expect(markup).toContain("Foto de Treinador real");
    expect(markup).toContain("Foto de Atleta 99");
    expect(markup).toContain("zf-formation-shirt");
    expect(markup).toContain("zf-formation-bench-photo");
    expect(markup).toContain("zf-formation-coach-photo");
    expect(markup).toContain('data-layout="sectors"');
    expect(markup).not.toContain("zf-formation-bottom-box");
  });
  test("premium match cards and lineup share the emerald glass identity",()=>{
    const css=readFileSync("src/styles/lineup-glass-premium.css","utf8");
    const modal=readFileSync("src/components/sports/MatchLineups.tsx","utf8");
    expect(css).toContain("#16614a");
    expect(css).toContain(".zf-lineup-match-ribbon");
    expect(css).toContain(".zf-formation-coach");
    expect(css).toContain("@media(max-width:760px)");
    expect(css).toContain('html[data-zf-platform="tv"]');
    expect(modal).toContain('import "@/styles/lineup-glass-premium.css"');
    expect(modal).toContain("<TeamLineupBoard team={selected} gameId={game.id}/>");
    expect(modal).toContain("lineupEvidence(data,selected");
    expect(modal).toContain("aria-modal=\"true\"");
  });
});
