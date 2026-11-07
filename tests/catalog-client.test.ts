// tests/catalog-client.test.ts — prevent a large mobile route from mounting the entire catalog.
import { describe, expect, test } from "bun:test";
import { CATALOG_PAGE_SIZE, catalogVisibleItems, getClientCatalog, nextCatalogPage } from "../src/lib/catalog-client";

describe("mobile catalog incremental rendering", () => {
  const all = Array.from({ length: 12000 }, (_, id) => ({id}));
  test("only renders the first batch on entry, regardless of total items", () => {
    const visible = catalogVisibleItems(all, CATALOG_PAGE_SIZE);
    expect(visible.length).toBe(36);
    expect(visible.at(-1)?.id).toBe(35);
  });
  test("adds a small batch and never exceeds the result count", () => {
    expect(nextCatalogPage(CATALOG_PAGE_SIZE, all.length)).toBe(72);
    expect(nextCatalogPage(72, 76)).toBe(76);
    expect(nextCatalogPage(76, 76)).toBe(76);
  });
  test("handles empty and negative limits without constructing thousands of elements", () => {
    expect(catalogVisibleItems(all, -1)).toEqual([]);
    expect(catalogVisibleItems([], CATALOG_PAGE_SIZE)).toEqual([]);
  });
});


describe("client catalog navigation cache", () => {
  test("reuses an in-flight request and prevents duplicate JSON parsing during menu navigation", async () => {
    const previous = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL) => {
      fetchCount++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return new Response(JSON.stringify({
        items:[{ id:"filme", title:"Teste", type:"f", genres:[], streams:[] }],
        highlights:[], genres:[],
      }), { status:200, headers:{"content-type":"application/json"} });
    }) as typeof fetch;
    try {
      const [first, second] = await Promise.all([getClientCatalog(), getClientCatalog()]);
      expect(fetchCount).toBe(1);
      expect(first).toBe(second);
      expect((await getClientCatalog()).items[0]?.id).toBe("filme");
      expect(fetchCount).toBe(1);
    } finally {
      globalThis.fetch = previous;
    }
  });
});
