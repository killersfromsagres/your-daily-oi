import { describe, expect, it } from "bun:test";
import type { CanalTV } from "../src/lib/canais";
import { retainLiveCatalogOnMetadataOutage, reuseUnchangedLiveChannels } from "../src/lib/tv-catalog-recovery";

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
  it("keeps a currently playing football channel during partial metadata outages", () => {
    const other = { id:"aberto", nome:"Canal aberto", categoria:"TV Aberta",
      fontes:[{url:"https://licensed.example.test/open.m3u8"}] };
    const partial = retainLiveCatalogOnMetadataOutage(
      [live, other], [metadata, other], { channelId:live.id, playbackConfirmed:true });
    expect(partial[0]?.fontes).toEqual(live.fontes);
    expect(partial[0]?.indisponivel).toBe(false);
    expect(partial[1]).toBe(other);
    // After a verified playback failure, the empty fresh source list wins.
    expect(retainLiveCatalogOnMetadataOutage([live,other],[metadata,other],
      {channelId:live.id,playbackConfirmed:false})[0]?.fontes).toEqual([]);
  });
  it("defers a source rotation only during verified continuous playback", () => {
    const rotated = {...live, fontes:[{url:"https://licensed.example.test/new.m3u8"}]};
    const active = retainLiveCatalogOnMetadataOutage([live],[rotated],
      {channelId:live.id,playbackConfirmed:true});
    expect(active[0]).toBe(live);
    const afterFailure = retainLiveCatalogOnMetadataOutage([live],[rotated],
      {channelId:live.id,playbackConfirmed:false});
    expect(afterFailure[0]).toBe(rotated);
  });
  it("keeps stable channel objects when unrelated sports feeds rotate", () => {
    const other = { id:"sport-2", nome:"Outro", categoria:"Esportes",
      fontes:[{url:"https://licensed.example.test/other.m3u8"}] };
    const changed = {...other, fontes:[{url:"https://licensed.example.test/rotated.m3u8"}]};
    const clone = {...live, fontes:live.fontes.map(f => ({...f}))};
    const reconciled = reuseUnchangedLiveChannels([live,other],[clone,changed]);
    expect(reconciled[0]).toBe(live);
    expect(reconciled[0]?.fontes).toBe(live.fontes);
    expect(reconciled[1]).toBe(changed);
  });
});
