import { describe, expect, test } from "bun:test";
import { loadZangCatalogArchive, loadZangTvArchive, loadZangSushiArchive } from "../src/lib/zang-archive";
import { parseFichas } from "../src/lib/catalog";

describe("ZANG FLIX independent archived metadata", () => {
  test("keeps locally known anime metadata even without Saimo or Sushi", async () => {
    const archive=await loadZangCatalogArchive();
    expect(archive).not.toBeNull();
    const catalog=parseFichas(archive?.fichas || "");
    expect(catalog.size).toBeGreaterThan(10);
    expect([...catalog.values()].some(item => item.type==="a" && item.title==="One Piece")).toBe(true);
  });
  test("does not restore any media URL or encrypted key from a public snapshot", async () => {
    const archive=await loadZangCatalogArchive();
    expect(archive?.fichas).not.toMatch(/(?:\bdub=|\bleg=|\bchave=|https?:\/\/)/i);
    for (const ch of await loadZangTvArchive()) {
      expect(ch.fontes).toEqual([]);
      expect(ch.indisponivel).toBe(true);
    }
    for(const anime of await loadZangSushiArchive()){
      expect(anime.slug).toMatch(/^[a-z0-9-]+$/i);
      expect(anime).not.toHaveProperty("streams");
    }
  });
});
