import {describe,expect,test} from "bun:test";
import {catalogTarget,compatibleCategory,categorySlug,catalogKind,CATALOG_CATEGORIES} from "../src/lib/mobile-catalog-filters";
describe("mobile content and category selection",()=>{
 test("keeps action and horror when switching between movies and series",()=>{
  expect(catalogTarget("f","Terror")).toEqual({to:"/generos/$slug",params:{slug:"terror"},search:{tipo:"f"}});
  expect(catalogTarget("s","Terror")).toEqual({to:"/generos/$slug",params:{slug:"terror"},search:{tipo:"s"}});
  expect(catalogTarget("a","Ação")).toEqual({to:"/animes",search:{categoria:"acao"}});
 });
 test("resets categories unavailable in the target provider",()=>{
  expect(compatibleCategory("a","terror")).toBe("");
  expect(catalogTarget("f","sh-nen")).toEqual({to:"/generos/$slug",params:{slug:"filmes"},search:{tipo:"f"}});
  expect(catalogTarget("s","dublado").params?.slug).toBe("series");
  expect(catalogTarget("a","terror").search).toEqual({categoria:undefined});
 });
 test("normalizes accented categories and existing content aliases",()=>{
  expect(categorySlug("Ficção científica")).toBe("ficcao-cientifica");
  expect(categorySlug("Shōnen")).toBe("sh-nen");
  expect(catalogKind("series")).toBe("s");expect(catalogKind("a")).toBe("a");
  expect(catalogKind("todos")).toBeNull();expect(catalogKind(undefined)).toBeNull();
 });
 test("all category links have a deterministic destination and no duplicate choices",()=>{
  for(const kind of ["f","s","a"] as const){
   const list=CATALOG_CATEGORIES[kind];
   expect(new Set(list.map(item=>item.slug)).size).toBe(list.length);
   expect(list[0]?.slug).toBe("");
   for(const item of list)expect(compatibleCategory(kind,item.slug)).toBe(item.slug);
  }
 });
});
