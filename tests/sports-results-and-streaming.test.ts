import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifiedMatchResult, applyVerifiedResult } from "../src/lib/football-result-verified";
import { verifiedBroadcastEvidence } from "../src/lib/broadcast-verified";
import { mergeProviderFixtures } from "../src/lib/football-backup";
import { mergeFootballScores, liveScoreLeagueIds } from "../src/lib/football-ranking";
import type { JogoBrasileirao } from "../src/lib/jogos-match";

const date="2026-11-14";
function fixture(home:string,away:string,status:JogoBrasileirao["status"]="agendado"):JogoBrasileirao {
  return {
    id:"fifa.friendly:100",
    casa:home,fora:away,escudoCasa:undefined,escudoFora:undefined,
    inicioIso:"2026-11-14T10:15:00Z",dataLocal:date,horarioLocal:"07:15",
    rodada:undefined,liga:"Amistosos de seleções",ligaId:"fifa.friendly",
    ligaLogo:null,grupo:"internacional",status,
    fase:status==="encerrado"?"encerrado":"agendado",minuto:null,
    placarCasa:null,placarFora:null,destaque:true,
    canalId:null,canalNome:null,canalLogo:null,transmissao:"nao-confirmada",
  };
}

describe("verified results vs lagging fixture feeds",()=>{
  test("Japan 3 x 2 Brazil is final only after the official CBF report",()=>{
    const game=fixture("Japão","Brasil");
    const before=Date.parse("2026-11-14T12:41:00Z");
    const after=Date.parse("2026-11-14T12:43:00Z");
    expect(verifiedMatchResult(game,before)).toBeNull();
    expect(verifiedMatchResult(game,after)).toMatchObject({homeScore:3,awayScore:2});
    const final=applyVerifiedResult(game,after);
    expect(final.status).toBe("encerrado");
    expect(final.fase).toBe("encerrado");
    expect(final.placarCasa).toBe(3);
    expect(final.placarFora).toBe(2);
    expect(game.status).toBe("agendado");
  });

  test("Brazil x Japan also respects reversed teams and native English provider labels",()=>{
    const result=verifiedMatchResult(fixture("Brazil","Japan"),Date.parse("2026-11-14T13:00:00Z"));
    expect(result?.homeScore).toBe(2);
    expect(result?.awayScore).toBe(3);
  });

  test("another day or matchup never inherits the final score",()=>{
    const now=Date.parse("2026-11-15T12:00:00Z");
    expect(verifiedMatchResult({...fixture("Japan","Brazil"),dataLocal:"2026-11-15"},now)).toBeNull();
    expect(verifiedMatchResult(fixture("Japan","Argentina"),now)).toBeNull();
  });

  test("provider's completed score is never overwritten by the verified fallback",()=>{
    const completed={...fixture("Japan","Brazil","encerrado"),placarCasa:3,placarFora:2};
    expect(applyVerifiedResult(completed)).toBe(completed);
  });

  test("full-time cannot regress to kickoff after a stale score refresh",()=>{
    const done=applyVerifiedResult(fixture("Japan","Brazil"),Date.parse("2026-11-14T13:00:00Z"));
    const stale=fixture("Japan","Brazil");
    const [game]=mergeFootballScores([done],[stale],date);
    expect(game?.status).toBe("encerrado");
    expect(game?.placarCasa).toBe(3);
    expect(game?.placarFora).toBe(2);
  });

  test("independent finished fixture upgrades stale ESPN state but keeps ESPN identity",()=>{
    const first=fixture("Mirassol","Atlético-MG");
    first.id="bra.1:120";
    first.ligaId="bra.1";
    const second={...first,id:"sportsdb:750",casa:"Mirassol",fora:"Atlético Mineiro",
      status:"encerrado" as const,fase:"encerrado" as const,
      placarCasa:1,placarFora:0};
    const [merged]=mergeProviderFixtures([first],[second]);
    expect(merged?.status).toBe("encerrado");
    expect(merged?.placarCasa).toBe(1);
    expect(merged?.id).toBe("bra.1:120");
  });

  test("an overdue scheduled game still receives final-score polling",()=>{
    const old=fixture("Japan","Brazil");
    expect(liveScoreLeagueIds([old],Date.parse("2026-11-14T21:00:00Z")))
      .toContain("fifa.friendly");
  });
});

describe("exclusive verified Mirassol x Atlético-MG broadcast",()=>{
  test("Prime Video is linked only to correct match and date",()=>{
    const proof=verifiedBroadcastEvidence({
      casa:"Mirassol FC",fora:"Atlético Mineiro",dataLocal:date,
    });
    expect(proof?.names).toEqual(["Prime Video"]);
    expect(proof?.exclusive).toBe(true);
    expect(proof?.watchUrl).toBe("https://www.primevideo.com/detail/0SAJWPZH2WON1C43SOHFWQBD4D");
    expect(verifiedBroadcastEvidence({casa:"Mirassol",fora:"Atlético-MG",dataLocal:"2026-11-15"})).toBeNull();
    expect(verifiedBroadcastEvidence({casa:"Mirassol",fora:"São Paulo",dataLocal:date})).toBeNull();
  });

  test("game card offers official link and displays final score rather than old kickoff",()=>{
    const ui=readFileSync("src/components/tv/JogosShelf.tsx","utf8");
    expect(ui).toContain('active||game.status==="encerrado"');
    expect(ui).toContain('"RESULTADO FINAL"');
    expect(ui).toContain('className="zf-ticket-watch zf-ticket-watch-external"');
    expect(ui).toContain('href={officialUrl}');
    expect(ui).toContain('rel="noopener noreferrer"');
  });
});
