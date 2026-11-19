import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {estimatePitchFromForecast,resolveVenueCity,normalizedCountryCode} from "../src/lib/pitch-weather";

describe("stadium municipality resolution",()=>{
  test("uses ESPN-reported venue city before stadium aliases",()=>{
    expect(resolveVenueCity("Neo Química Arena","São Paulo")).toBe("São Paulo");
    expect(resolveVenueCity("Arena do Grêmio","Porto Alegre")).toBe("Porto Alegre");
  });
  test("uses only recognizable stadium fallbacks, never invents an unknown location",()=>{
    expect(resolveVenueCity("Neo Química Arena")).toBe("São Paulo");
    expect(resolveVenueCity("Estádio Mineirão")).toBe("Belo Horizonte");
    expect(resolveVenueCity("Arena do Grêmio")).toBe("Porto Alegre");
    expect(resolveVenueCity("Maracanã")).toBe("Rio de Janeiro");
    expect(resolveVenueCity("Estádio não informado")).toBeNull();
    expect(resolveVenueCity(undefined)).toBeNull();
    expect(normalizedCountryCode("Brasil")).toBe("BR");
    expect(normalizedCountryCode("Brazil")).toBe("BR");
    expect(normalizedCountryCode("PT")).toBe("PT");
  });
});
const hourly={
  time:["2026-11-18T22:00","2026-11-18T23:00","2026-11-19T00:00","2026-11-19T01:00"],
  precipitation:[0,0.2,0.4,0],
  rain:[0,0.2,0.4,0],
  weather_code:[0,51,61,2],
};
describe("hourly regional rain and estimated pitch condition",()=>{
  test("wet after rain or drizzle near kickoff/current in-play hour",()=>{
    const wet=estimatePitchFromForecast({hourly},"2026-11-19T00:00:00.000Z","São Paulo");
    expect(wet.condicao).toBe("molhado");
    expect(wet.chuvaMm).toBe(0.6);
    expect(wet.estimado).toBe(true);
    expect(wet.fonte).toBe("Open-Meteo");
  });
  test("weather-only reports probable dry, never verified ground moisture",()=>{
    const dry=estimatePitchFromForecast({
      hourly:{time:["2026-11-18T22:00"],precipitation:[0],weather_code:[0]},
    },"2026-11-18T22:00:00Z","Porto Alegre");
    expect(dry.condicao).toBe("seco");
    expect(dry.estimado).toBe(true);
    expect(dry.resumo).toContain("região");
  });
  test("unknown weather does not show fake dry or wet conditions",()=>{
    expect(estimatePitchFromForecast({hourly:{time:[],precipitation:[]}},
      "2026-11-18T22:00:00Z","Rio de Janeiro").condicao).toBe("indisponivel");
    expect(estimatePitchFromForecast({hourly:{time:["2026-11-18T22:00"],precipitation:[]}},
      "2026-11-18T22:00:00Z","Rio de Janeiro").condicao).toBe("indisponivel");
    expect(estimatePitchFromForecast({hourly},
      "2026-12-09T22:00:00Z","São Paulo").condicao).toBe("indisponivel");
  });
  test("even drizzle with zero rounded rain count can mark likely wet",()=>{
    const wet=estimatePitchFromForecast({hourly:{
      time:["2026-11-18T22:00"],precipitation:[0],weather_code:[53],
    }},"2026-11-18T22:00:00Z","São Paulo");
    expect(wet.condicao).toBe("molhado");
  });
});
describe("responsive football match cards",()=>{
  test("the venue groups the stadium and pitch in one compact card",()=>{
    const ui=readFileSync("src/components/tv/JogosShelf.tsx","utf8");
    expect(ui).toContain('className="zf-ticket-venue-card"');
    expect(ui).toContain("<StadiumIcon size={27}/>");
    expect(ui).toContain("<PitchCondition game={game}/>");
    expect(ui).not.toContain("TRANSMISSORA IDENTIFICADA · ");
    expect(ui).toContain("TRANSMISSORA ANUNCIADA");
    expect(ui).toContain("ASSISTIR NO CANAL");
    const pitch=readFileSync("src/components/sports/PitchCondition.tsx","utf8");
    expect(pitch).toContain('className="zf-ticket-pitch-copy"');
    expect(pitch).toContain("CONDIÇÃO DO CAMPO · ESTIMATIVA");
    expect(pitch).toContain('stroke="currentColor"');
  });
  test("broadcast labels do not collapse to vertical letters or grow 100vh",()=>{
    const css=readFileSync("src/styles/sports-pitch-ui.css","utf8");
    expect(css).toContain(".zf-ticket-channel-unlinked");
    expect(css).toContain("word-break: normal");
    expect(css).toContain("overflow-wrap: normal");
    expect(css).toContain("flex: 0 0 auto");
    expect(css).toContain(".zf-ticket-venue-card");
  });
  test("EPG/schedule channel search persists and the slow score refresh keeps alternatives",()=>{
    const tv=readFileSync("src/components/tv/TvView.tsx","utf8");
    expect(tv).toContain('setQuery(channelName || "")');
    expect(tv).not.toContain('setQuery(channelName || "");\n              setQuery("")');
    const sports=readFileSync("src/lib/jogos.ts","utf8");
    expect(sports).toContain("matchBrazilianBroadcastChannel(name, available)");
    expect(sports).toContain("parsed.canaisDisponiveis = older.canaisDisponiveis");
    expect(sports).toContain("getGuideBroadcasts(date)");
  });
});
