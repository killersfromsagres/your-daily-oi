// tests/search-autocomplete.test.ts — Bun; ranked instant search, accents, duplicate handling and route resolution.
import { describe, expect, test } from "bun:test";
import { normalizeSearchTerm, rankSearchSuggestions, searchSuggestionPath } from "../src/lib/search-suggestions";
import type { CatalogItem } from "../src/lib/types";

const entries: CatalogItem[] = [
  { id:"naruto-anime",title:"Naruto",type:"a",genres:["Anime"],streams:[],posterUrl:"/naruto.jpg" },
  { id:"naruto-film",title:"Naruto: O Filme",type:"f",genres:["Animação"],streams:[] },
  { id:"interestelar",title:"Interestelar",type:"f",genres:["Ficção"],streams:[] },
  { id:"sao-paulo",title:"São Paulo: Histórias",type:"s",genres:["Drama"],streams:[] },
  { id:"one-piece",title:"One Piece",type:"a",genres:["Anime"],streams:[] },
  { id:"one-piece-alias",title:"One Piece",type:"a",genres:["Anime"],streams:[],alias:true },
  { id:"one-piece-live",title:"One Piece: A Série",type:"s",genres:["Aventura"],streams:[] },
  { id:"bizarre",title:"Um Bizarro Mundo Naruto",type:"s",genres:[],streams:[] },
];

describe("Sugestões do catálogo ZANG FLIX", () => {
  test("ignora acentos, pontuação e espaços extras", () => {
    expect(normalizeSearchTerm("  SÃO---PAULO   ")).toBe("sao paulo");
    expect(rankSearchSuggestions(entries,"sao paulo")[0]?.title).toBe("São Paulo: Histórias");
  });
  test("ordena correspondências exatas e prefixos antes das menções no meio do título", () => {
    const result=rankSearchSuggestions(entries,"naruto");
    expect(result.map(x=>x.id)).toEqual(["naruto-anime","naruto-film","bizarre"]);
  });
  test("separa filmes, séries e animes e evita duplicatas de aliases", () => {
    const result=rankSearchSuggestions(entries,"one piece");
    expect(result.map(x=>x.id)).toEqual(["one-piece","one-piece-live"]);
    expect(result.map(x=>x.type)).toEqual(["a","s"]);
  });
  test("lida com pesquisas vazias, consultas sem resultado e limite de oito", () => {
    expect(rankSearchSuggestions(entries,"  ")).toEqual([]);
    expect(rankSearchSuggestions(entries,"notfound")).toEqual([]);
    expect(rankSearchSuggestions(entries,"one",1)).toHaveLength(1);
    expect(rankSearchSuggestions(entries,"one",0)).toEqual([]);
  });
  test("mantém identidade e endereço correto para abrir cada ficha", () => {
    expect(searchSuggestionPath({type:"f",id:"filme-teste"})).toBe("/filme/filme-teste");
    expect(searchSuggestionPath({type:"s",id:"minha serie"})).toBe("/serie/minha%20serie");
    expect(searchSuggestionPath({type:"a",id:"naruto-anime"})).toBe("/anime/naruto-anime");
    expect(rankSearchSuggestions(entries,"Naruto")[0]?.posterUrl).toBe("/naruto.jpg");
  });
});
