import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const read = (p:string) => readFileSync(new URL(p,import.meta.url),"utf8");
describe("TCL Android TV experience",()=>{
 test("uses dedicated TV home and bounded catalog response",()=>{
  const route=read("../src/routes/tv-home.tsx");
  expect(route).toContain('"/api/catalogo?tv=1"');
  expect(route).toContain("installTvRemoteNavigation()");
  expect(route).not.toContain("getClientCatalog(");
 });
 test("selects actual suggestion and signals focus",()=>{
  const route=read("../src/routes/tv-home.tsx");
  expect(route).toContain("onClick={() => choose(item)}");
  expect(route).toContain("searchSuggestionPath(item)");
  expect(route).toContain('key === "ArrowDown"');
  const css=read("../src/styles/tv-home.css");
  expect(css).toContain(".zf-tvh-suggestion:focus");
  expect(css).toContain(".zf-tvh-poster:focus");
  expect(css).not.toContain("backdrop-filter");
 });
});
