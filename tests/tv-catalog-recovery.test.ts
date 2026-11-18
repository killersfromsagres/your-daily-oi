import { describe, expect, it } from "bun:test";
import type { CanalTV } from "../src/lib/canais";
import { retainLiveCatalogOnMetadataOutage } from "../src/lib/tv-catalog-recovery";

const live: CanalTV = {
  id: "canal-teste", nome: "Canal teste", categoria: "Esportes",
  fontes: [{url:"https://licensed.example.test/live.m3u8"}],
};
const metadata: CanalTV = {
  id: live.id, nome: live.nome, categoria: live.categoria, indisponivel: true,
  fontes: [],
};
describe("TV metadata-only outage recovery", () => {
  it("keeps a stream already playing if the entire catalog loses source data", () => {
    const before = [live];
    expect(retainLiveCatalogOnMetadataOutage(before,[metadata])).toBe(before);
  });
  it("keeps existing stream but still exposes newly archived channel names", () => {
    const saved = {id:"novo",nome:"Novo",categoria:"Notícias",fontes:[]};
    const recovered = retainLiveCatalogOnMetadataOutage([live], [metadata,saved]);
    expect(recovered).toHaveLength(2);
    expect(recovered[0]?.fontes).toEqual(live.fontes);
    expect(recovered[1]?.fontes).toEqual([]);
  });
  it("accepts a real updated catalog including channel removals", () => {
    const good = { ...live, fontes:[{url:"https://licensed.example.test/new.m3u8"}] };
    expect(retainLiveCatalogOnMetadataOutage([live],[good,metadata])).toEqual([good,metadata]);
  });
  it("never fabricates a media source on a fresh page load", () => {
    expect(retainLiveCatalogOnMetadataOutage([], [metadata])).toEqual([metadata]);
  });
});
