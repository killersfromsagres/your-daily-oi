// tests/jogos-match.test.ts — Bun unit tests, fixtures/timezone/broadcasts.
import { describe, expect, test } from "bun:test";
import {
  LIGAS_FUTEBOL, addDaysUTC, brBroadcastsFromESPN,
  dataBrasilia, doesEpgDescribeFixture, horaBrasilia,
  isFeaturedTeam, isValidSportsDate, parseESPNFixture,
} from "../src/lib/jogos-match";

const sample = (iso: string, state="pre") => ({
  id: "12345",
  date: iso,
  status: { type: { state, completed: state === "post" } },
  competitions: [{
    date: iso,
    competitors: [
      { homeAway:"home", score:"2", team:{id:"111", displayName:"Flamengo",logo:"https://a.espncdn.com/flamengo.png"} },
      { homeAway:"away", score:"1", team:{id:"222", displayName:"Palmeiras",logo:"https://a.espncdn.com/palmeiras.png"} },
    ],
    geoBroadcasts: [
      { region:"us",media:{shortName:"ESPN+"} },
      { region:"br",media:{shortName:"Premiere"} },
    ],
  }],
});
describe("Datas de futebol em Brasília", () => {
  test("converte partidas à noite sem mudar indevidamente o dia", () => {
    expect(dataBrasilia(new Date("2026-11-08T01:30:00Z"))).toBe("2026-11-07");
    expect(horaBrasilia(new Date("2026-11-08T01:30:00Z"))).toBe("22:30");
  });
  test("rejeita dias inválidos e faz virada do mês corretamente", () => {
    expect(isValidSportsDate("2026-02-29")).toBe(false);
    expect(isValidSportsDate("2028-02-29")).toBe(true);
    expect(isValidSportsDate("2026-13-31")).toBe(false);
    expect(addDaysUTC("2026-12-31",1)).toBe("2027-01-01");
  });
  test("filtra estritamente pela data local, não pela UTC", () => {
    const event=sample("2026-11-08T01:30:00Z");
    expect(parseESPNFixture(event,LIGAS_FUTEBOL[0],"2026-11-07")?.horarioLocal).toBe("22:30");
    expect(parseESPNFixture(event,LIGAS_FUTEBOL[0],"2026-11-08")).toBeNull();
  });
  test("respeita confrontos incompletos e data inválida",()=>{
    const match=sample("2026-11-07T18:00:00Z");
    match.competitions[0].competitors=[];
    expect(parseESPNFixture(match,LIGAS_FUTEBOL[0],"2026-11-07")).toBeNull();
    expect(parseESPNFixture(sample("INVALID"),LIGAS_FUTEBOL[0],"2026-11-07")).toBeNull();
  });
});
describe("Placar, escudos e campeonatos",()=>{
  test("não mostra placar antes de a partida começar",()=>{
    const result=parseESPNFixture(sample("2026-11-07T21:00:00Z"),LIGAS_FUTEBOL[0],"2026-11-07")!;
    expect(result.placarCasa).toBeNull();
    expect(result.placarFora).toBeNull();
    expect(result.escudoCasa).toContain("espncdn.com");
    expect(result.liga).toBe("Brasileirão Série A");
    expect(result.destaque).toBe(true);
  });
  test("informa placar e status em andamento",()=>{
    const result=parseESPNFixture(sample("2026-11-07T21:00:00Z","in"),LIGAS_FUTEBOL[0],"2026-11-07")!;
    expect(result.status).toBe("ao-vivo");
    expect(result.placarCasa).toBe(2);
    expect(result.placarFora).toBe(1);
  });
  test("identifica clubes nacionais e europeus de relevância",()=>{
    expect(isFeaturedTeam("São Paulo")).toBe(true);
    expect(isFeaturedTeam("Real Madrid")).toBe(true);
    expect(isFeaturedTeam("Bayern Munich")).toBe(true);
    expect(isFeaturedTeam("Equipe Desconhecida")).toBe(false);
  });
});
describe("Confirmação de emissoras",()=>{
  test("ignora os direitos de transmissão dos EUA, aceita somente Brasil",()=>{
    expect(brBroadcastsFromESPN(sample("2026-11-07T21:00:00Z"))).toEqual(["Premiere"]);
    const e=sample("2026-11-07T21:00:00Z");
    e.competitions[0].geoBroadcasts=[{region:"us",media:{shortName:"ESPN+"}}];
    expect(brBroadcastsFromESPN(e)).toEqual([]);
  });
  test("não inventa transmissão quando evento ESPN não informa país",()=>{
    const e=sample("2026-11-07T21:00:00Z");
    e.competitions[0].geoBroadcasts=[];
    const match=parseESPNFixture(e,LIGAS_FUTEBOL[0],"2026-11-07")!;
    expect(match.canalId).toBeNull();
    expect(match.transmissao).toBe("nao-confirmada");
  });

  test("reconhece nomes alternativos do Atlético-MG e do Athletico-PR sem aceitar adversário errado", () => {
    expect(doesEpgDescribeFixture("Atlético-MG x Corinthians - Brasileirão", "Atlético Mineiro","Corinthians")).toBe(true);
    expect(doesEpgDescribeFixture("Athletico PR x São Paulo", "Athletico Paranaense","São Paulo")).toBe(true);
    expect(doesEpgDescribeFixture("Atlético-MG x Santos", "Atlético Mineiro","Corinthians")).toBe(false);
  });
  test("EPG só confirma confronto quando ambos os times aparecem",()=>{
    expect(doesEpgDescribeFixture("Campeonato Brasileiro: Flamengo x Palmeiras", "Flamengo","Palmeiras")).toBe(true);
    expect(doesEpgDescribeFixture("Flamengo x Corinthians","Flamengo","Palmeiras")).toBe(false);
    expect(doesEpgDescribeFixture("ESPN - Futebol ao vivo","Flamengo","Palmeiras")).toBe(false);
    expect(doesEpgDescribeFixture("Sao Paulo x Santos","São Paulo","Santos")).toBe(true);
  });
});
