import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {parseESPNGoalEvents,goalMinute,getESPNGoalEvents} from "../src/lib/match-goal-events";
import {parseESPNFixture,LIGAS_FUTEBOL,type JogoBrasileirao} from "../src/lib/jogos-match";
import {mergeFootballScores} from "../src/lib/football-ranking";

const clubs={homeId:"5",awayId:"9"};
const goal=(id:string,side="5",name="Gabriel",minute="39'",period=1)=>({
  id,scoringPlay:true,
  type:{name:"Goal",text:"Goal"},
  team:{id:side},
  period,
  clock:{displayValue:minute},
  athletesInvolved:[{id:"123",displayName:name}],
});
const date="2026-11-19";
const fixture=(status:JogoBrasileirao["status"]):JogoBrasileirao=>({
  id:"bra.1:999999",casa:"Corinthians",fora:"Botafogo",
  escudoCasa:undefined,escudoFora:undefined,
  horarioLocal:"19:30",inicioIso:"2026-11-19T22:30:00Z",dataLocal:date,
  liga:"Brasileirão Série A",ligaId:"bra.1",ligaLogo:null,grupo:"brasileirao",
  status,placarCasa:1,placarFora:0,destaque:true,
  canalId:"premiere3",canalNome:"Premiere 3",canalLogo:null,transmissao:"confirmada",
  canaisDisponiveis:[{id:"premiere3",nome:"Premiere 3"},
    {id:"sportv",nome:"SporTV"},{id:"globosp",nome:"Globo SP"}],
});

describe("verified goal attribution and exact minutes",()=>{
  test("Gabriel 39' and another scorer 82' appear only for their actual ESPN teams",()=>{
    const result=parseESPNGoalEvents({keyEvents:[
      goal("a","5","Gabriel","39'",1),
      goal("b","9","João Pedro","82'",2),
    ]},clubs);
    expect(result.map(g=>[g.team,g.scorer,g.minute])).toEqual([
      ["home","Gabriel","39′"],["away","João Pedro","82′"],
    ]);
  });
  test("a 2nd-half running clock is normalized, absolute match clock is preserved",()=>{
    expect(goalMinute(goal("x","5","Gabriel","37:14",2))).toBe("82′");
    expect(goalMinute(goal("x","5","Gabriel","82'",2))).toBe("82′");
    expect(goalMinute(goal("x","5","Gabriel","45+2'",1))).toBe("45+2′");
    expect(goalMinute(goal("x","5","Gabriel","90+6'",2))).toBe("90+6′");
    expect(goalMinute({...goal("x"),clock:{displayValue:"unknown"}})).toBeNull();
  });
  test("does not invent a scorer from final score, free text, other team or canceled goals",()=>{
    const fake=[
      {...goal("a"),athletesInvolved:[]},
      {...goal("b"),team:{id:"other"}},
      {...goal("c"),cancelled:true},
      {...goal("d"),type:{name:"Own Goal",text:"Own Goal"}},
      {...goal("e"),type:{name:"Goal Kick",text:"Goal Kick"},scoringPlay:false},
      {...goal("f"),type:{name:"Penalty Miss",text:"Penalty Miss"},scoringPlay:false},
    ];
    expect(parseESPNGoalEvents({keyEvents:fake},clubs)).toEqual([]);
    expect(parseESPNGoalEvents({keyEvents:[goal("a")]},{homeId:"5",awayId:"5"})).toEqual([]);
    expect(parseESPNGoalEvents({},clubs)).toEqual([]);
  });
  test("a goal in multiple ESPN play collections is deduplicated",()=>{
    const a=goal("a","5","Gabriel","39'",1);
    expect(parseESPNGoalEvents({keyEvents:[a],scoringPlays:[a],plays:[a]},clubs)).toHaveLength(1);
  });
  test("reads embedded ESPN scoreboard goals and penalty credit without guessing",()=>{
    const raw={
      id:"999999",date:"2026-11-19T22:30:00Z",
      status:{type:{state:"in"},period:2},
      competitions:[{
        date:"2026-11-19T22:30:00Z",
        details:[{...goal("g","5","Gabriel","82'",2),type:{name:"Penalty Goal",text:"Penalty Goal"}}],
        competitors:[
          {homeAway:"home",score:"1",team:{id:"5",displayName:"Corinthians"}},
          {homeAway:"away",score:"0",team:{id:"9",displayName:"Botafogo"}},
        ],
      }],
    };
    const parsed=parseESPNFixture(raw,LIGAS_FUTEBOL[0]!,date);
    expect(parsed?.gols?.[0]).toMatchObject({scorer:"Gabriel",team:"home",minute:"82′",penalty:true});
    expect(parsed?.placarCasa).toBe(1);
    expect(parsed?.placarFora).toBe(0);
  });
  test("ESPN detail fetch is cached, deduped and returns no fabricated goals on failure",async()=>{
    const original=globalThis.fetch;
    const requests:string[]=[];
    globalThis.fetch=(async(input:RequestInfo|URL)=>{
      requests.push(String(input));
      return Response.json({keyEvents:[goal("goal-upstream","5","Gabriel","39'")]});
    }) as typeof fetch;
    try{
      const p=getESPNGoalEvents("bra.1","400998877",clubs);
      const q=getESPNGoalEvents("bra.1","400998877",clubs);
      const [first,second]=await Promise.all([p,q]);
      expect(first).toEqual(second);
      expect(first[0]?.minute).toBe("39′");
      expect(requests).toHaveLength(1);
      expect((await getESPNGoalEvents("bra.1","400998877",clubs)).length).toBe(1);
    }finally{globalThis.fetch=original;}
  });
});

describe("match card progressive goals and non-collapsing broadcasters",()=>{
  test("score refresh retains real goals only when the score stays unchanged",()=>{
    const first=fixture("ao-vivo");
    first.gols=[{id:"a",team:"home",scorer:"Gabriel",minute:"39′"}];
    const [kept]=mergeFootballScores([first],[{...first,gols:undefined}],date);
    expect(kept?.gols?.[0]?.scorer).toBe("Gabriel");
    const [cleared]=mergeFootballScores([first],[{...first,gols:undefined,placarCasa:0}],date);
    expect(cleared?.gols?.length||0).toBe(0);
  });
  test("finished status does not lose scorers after another scoreboard update",()=>{
    const first={...fixture("encerrado"),gols:[{id:"a",team:"home" as const,scorer:"Gabriel",minute:"39′"}]};
    const [merged]=mergeFootballScores([first],[{...first,gols:undefined}],date);
    expect(merged?.status).toBe("encerrado");
    expect(merged?.gols?.[0]?.minute).toBe("39′");
  });
  test("extra channel buttons are always present with no toggle/click prerequisite",()=>{
    const ui=readFileSync("src/components/tv/JogosShelf.tsx","utf8");
    expect(ui).toContain("otherChannels.length>0&&(");
    expect(ui).toContain("zf-ticket-alternate-channels");
    expect(ui).toContain("TAMBÉM EM");
    expect(ui).toContain("onClick={()=>onWatch(ch.id)}");
    expect(ui).not.toContain("channelsExpanded");
    expect(ui).not.toContain("zf-ticket-channels-toggle");
    expect(ui).toContain("goals.slice(-2)");
    expect(ui).toContain("goal.minute");
    expect(ui).toContain('className="zf-ticket-goals"');
  });
  test("premium differentiated status colors and no vertical card growth from alternate channels",()=>{
    const css=readFileSync("src/styles/football-card-details.css","utf8");
    expect(css).toContain("zf-ticket-status-row.is-scheduled");
    expect(css).toContain("zf-ticket-status-row.is-finished");
    expect(css).toContain("zf-ticket-status-row.is-postponed");
    expect(css).toContain("overflow-x:auto");
    expect(css).toContain(".zf-ticket-goals-team:first-child {grid-column:1;}");
    expect(css).toContain(".zf-ticket-goals-team:last-child {grid-column:3;}");
    expect(css).toContain("height:152px");
    expect(css).toContain("@media(max-width:610px)");
  });
});
