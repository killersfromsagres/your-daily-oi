import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {
  estimatePitchFromCurrent,getRegionalPitchEstimate,knownStadiumPoint,
} from "../src/lib/pitch-weather";

const now = new Date("2026-11-19T00:20:00Z");
const current = (rain:number,code:number,showers=0)=>({
  current:{time:"2026-11-19T00:15",precipitation:rain,rain,showers,weather_code:code},
});

describe("current weather at the stadium — no kickoff-hour forecast assumption",()=>{
  test("zero rain, zero showers and clear weather means dry",()=>{
    const result=estimatePitchFromCurrent(current(0,0),"Porto Alegre",now);
    expect(result.condicao).toBe("seco");
    expect(result.chuvaMm).toBe(0);
    expect(result.resumo).toContain("agora");
  });
  test("drizzle code marks ground likely wet even if mm is rounded to zero",()=>{
    for(const code of [51,53,55,61,80,95]){
      expect(estimatePitchFromCurrent(current(0,code),"São Paulo",now).condicao).toBe("molhado");
    }
  });
  test("rain or showers indicates wet regardless of WMO weather code",()=>{
    expect(estimatePitchFromCurrent(current(.04,0),"São Paulo",now).condicao).toBe("molhado");
    expect(estimatePitchFromCurrent(current(0,1,.2),"São Paulo",now).condicao).toBe("molhado");
  });
  test("missing, stale or invalid weather is never described as dry",()=>{
    expect(estimatePitchFromCurrent({}, "São Paulo",now).condicao).toBe("indisponivel");
    expect(estimatePitchFromCurrent({current:{time:"2026-11-19T00:15"}}, "São Paulo",now).condicao).toBe("indisponivel");
    expect(estimatePitchFromCurrent({current:{time:"2026-11-18T19:00",precipitation:0,weather_code:0}}, "São Paulo",now).condicao).toBe("indisponivel");
  });
  test("stadium coordinates are used only for verified venue names",()=>{
    expect(knownStadiumPoint("Neo Química Arena","São Paulo")).toEqual({lat:-23.5453,lon:-46.4743});
    expect(knownStadiumPoint("Arena do Grêmio","Porto Alegre")).toEqual({lat:-29.97333,lon:-51.19444});
    expect(knownStadiumPoint("Arena do Grêmio","Curitiba")).toBeNull();
    expect(knownStadiumPoint("Estádio hipotético","São Paulo")).toBeNull();
  });
  test("real-time Open-Meteo request chooses the exact stadium coordinate",async()=>{
    const actualFetch=globalThis.fetch;
    const observed:string[]=[];
    globalThis.fetch=(async(input:RequestInfo|URL)=>{
      const url=new URL(String(input));
      observed.push(url.href);
      if(url.hostname!=="api.open-meteo.com")throw new Error("Unexpected geocoder for known stadium");
      return Response.json(current(.6,61));
    }) as typeof fetch;
    try{
      const result=await getRegionalPitchEstimate({
        estadio:"Arena do Grêmio",cidade:"Porto Alegre",pais:"BR",
      },now);
      expect(result?.condicao).toBe("molhado");
      expect(observed).toHaveLength(1);
      const sent=new URL(observed[0]!);
      expect(sent.searchParams.get("latitude")).toBe("-29.97333");
      expect(sent.searchParams.get("longitude")).toBe("-51.19444");
      expect(sent.searchParams.get("current")).toBe("precipitation,rain,showers,weather_code");
      expect(sent.searchParams.has("hourly")).toBe(false);
    }finally{globalThis.fetch=actualFetch;}
  });
  test("city geocoder fallback uses location returned by the public API",async()=>{
    const actualFetch=globalThis.fetch;
    const observed:string[]=[];
    globalThis.fetch=(async(input:RequestInfo|URL)=>{
      const url=new URL(String(input));
      observed.push(url.href);
      if(url.hostname==="geocoding-api.open-meteo.com")
        return Response.json({results:[{
          name:"Cidade Exemplo",country_code:"BR",latitude:-18.5,longitude:-43.2,
        }]});
      return Response.json(current(0,0));
    }) as typeof fetch;
    try{
      const result=await getRegionalPitchEstimate({
        estadio:"Estádio Novo",cidade:"Cidade Exemplo",pais:"BR",
      },now);
      expect(result?.condicao).toBe("seco");
      expect(observed.some(x=>x.includes("geocoding-api.open-meteo.com"))).toBe(true);
      expect(observed.some(x=>x.includes("latitude=-18.5"))).toBe(true);
    }finally{globalThis.fetch=actualFetch;}
  });
});

describe("visual alignment and automatic refresh",()=>{
  test("home goal stays below home crest and away goal below away crest",()=>{
    const card=readFileSync("src/components/tv/JogosShelf.tsx","utf8");
    const home=card.indexOf('className="zf-ticket-score-home"');
    const away=card.indexOf('className="zf-ticket-score-away"');
    expect(home).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(home);
    expect(card).toContain('aria-label={"Gols de " + game.casa');
    expect(card).toContain('aria-label={"Gols de " + game.fora');
    const css=readFileSync("src/styles/sports-pitch-ui.css","utf8");
    expect(css).toContain(".zf-ticket-teams,");
    expect(css).toContain(".zf-ticket-score-pair {");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr)");
    expect(css).toContain(".zf-ticket-score-phase {");
    expect(css).toContain("flex-direction: row");
  });
  test("venue and pitch cells share a fixed row height and weather updates",()=>{
    const css=readFileSync("src/styles/sports-pitch-ui.css","utf8");
    expect(css).toContain("height: 56px;");
    expect(css).toContain(".zf-ticket-venue-card .zf-ticket-pitch");
    const ui=readFileSync("src/components/sports/PitchCondition.tsx","utf8");
    expect(ui).toContain('data-weather-state={state||"loading"}');
    expect(ui).toContain("3*60_000");
    expect(ui).toContain("getRegionalPitchEstimate");
    expect(ui).toContain('"/api/jogos-gramado?"');
    const route=readFileSync("src/server.ts","utf8");
    expect(route).toContain('url.pathname === "/api/jogos-gramado"');
    expect(route).not.toContain('!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/.test(inicioIso)');
  });
});
