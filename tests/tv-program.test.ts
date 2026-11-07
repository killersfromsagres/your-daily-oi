// tests/tv-program.test.ts — Bun unit tests for Zang Flix live-guide card content.
import { describe, expect, test } from "bun:test";
import {
  classifyProgramKind, resolveChannelProgram, searchableProgramText,
} from "../src/lib/tv-program";
import type { ProgramaEPG } from "../src/lib/epg";

const iso = (time: string) => Date.parse(time);
function programme(title: string, start: string, end: string, category?: string): ProgramaEPG {
  const result: ProgramaEPG = {
    titulo: title, horario: "19:00", fim: "20:00",
    inicioEm: start, fimEm: end,
  };
  if (category) result.categoria = category;
  return result;
}
describe("Guia de programação visível nos cards", () => {
  const onAir = programme("O Filme da Noite", "2026-11-07T20:00:00Z", "2026-11-07T21:00:00Z", "Filme");
  const after = programme("Próxima Atração", "2026-11-07T21:00:00Z", "2026-11-07T22:00:00Z", "Série");

  test("exibe título verdadeiro, categoria, faixa e próximo programa enquanto está passando", () => {
    const result = resolveChannelProgram({atual:onAir,proximo:after}, "Filmes e Séries", iso("2026-11-07T20:30:00Z"));
    expect(result.status).toBe("agora");
    expect(result.title).toBe("O Filme da Noite");
    expect(result.kind).toBe("Filme");
    expect(result.startTime).toBe("19:00");
    expect(result.endTime).toBe("20:00");
    expect(result.nextTitle).toBe("Próxima Atração");
  });
  test("troca automaticamente para o próximo programa quando chega o horário", () => {
    const result = resolveChannelProgram({atual:onAir,proximo:after}, "Filmes e Séries", iso("2026-11-07T21:20:00Z"));
    expect(result.status).toBe("agora");
    expect(result.title).toBe("Próxima Atração");
    expect(result.kind).toBe("Série");
  });
  test("não anuncia título antigo como atual depois de toda a grade terminar", () => {
    const result = resolveChannelProgram({atual:onAir,proximo:after}, "Filmes e Séries", iso("2026-11-07T22:20:00Z"));
    expect(result.status).toBe("sem-grade");
    expect(result.title).toBeNull();
  });
  test("antes do próximo programa, não apresenta programa futuro como transmitido", () => {
    const result = resolveChannelProgram({atual:null,proximo:after}, "Filmes e Séries", iso("2026-11-07T20:20:00Z"));
    expect(result.status).toBe("em-breve");
    expect(result.title).toBeNull();
    expect(result.nextTitle).toBe("Próxima Atração");
  });
  test("sem EPG não inventa filme, episódio ou anime específico", () => {
    const result = resolveChannelProgram(undefined, "Filmes e Séries", iso("2026-11-07T20:30:00Z"));
    expect(result.status).toBe("sem-grade");
    expect(result.title).toBeNull();
    expect(result.nextTitle).toBeNull();
    expect(result.kind).toBe("Filmes e séries");
    expect(result.hasSchedule).toBe(false);
  });
  test("classifica animes, séries, filmes, esportes, infantil e documentários", () => {
    expect(classifyProgramKind({titulo:"Naruto",categoria:"Anime"}, "Infantil")).toBe("Anime");
    expect(classifyProgramKind({titulo:"Temporada 1 - Episódio 5",categoria:"Séries"}, "Filmes e Séries")).toBe("Série");
    expect(classifyProgramKind({titulo:"Cinema Especial",categoria:"Movies"}, "TV Aberta")).toBe("Filme");
    expect(classifyProgramKind({titulo:"Futebol Ao Vivo",categoria:"Sports"}, "Esportes")).toBe("Esportes");
    expect(classifyProgramKind({titulo:"Planeta Terra",categoria:"Documentary"}, "Infantil")).toBe("Documentário");
    expect(classifyProgramKind(null, "Infantil")).toBe("Infantil");
  });
  test("pesquisa pelo título atual e próximo programa", () => {
    const text = searchableProgramText({atual:onAir,proximo:after});
    expect(text).toContain("O Filme da Noite");
    expect(text).toContain("Próxima Atração");
  });
  test("não exibe título vazio como programação identificada", () => {
    expect(resolveChannelProgram({atual:{titulo:"   "},proximo:null}, "TV Aberta").hasSchedule).toBe(false);
  });
});
