// tests/episode-progress.test.ts — Bun: durable season/episode history and completion.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  EPISODE_STORAGE_KEY, episodeKey, getEpisodeProgress, getEpisodeStatus,
  getEpisodePercentage, saveEpisodeProgress, setEpisodeWatched, countWatchedEpisodes,
  type EpisodeKey,
} from "../src/lib/episode-progress";

const storage = new Map<string,string>();
const localStorage = {
  getItem: (key:string)=>storage.get(key)??null,
  setItem: (key:string,value:string)=>{storage.set(key,value);},
  removeItem: (key:string)=>{storage.delete(key);},
};
beforeEach(()=>{
  storage.clear();
  Object.defineProperty(globalThis, "window", {configurable:true, value: {localStorage, dispatchEvent:()=>true} });
});
afterEach(()=>{ Reflect.deleteProperty(globalThis,"window");});
const ep:EpisodeKey={type:"a",contentId:"death-note-2006",season:1,episode:1};
describe("Zang Flix episode ledger",()=>{
  test("separate keys by type, content, season and episode",()=>{
    expect(episodeKey(ep)).not.toBe(episodeKey({...ep,episode:2}));
    expect(episodeKey(ep)).not.toBe(episodeKey({...ep,season:2}));
    expect(episodeKey(ep)).not.toBe(episodeKey({...ep,type:"s"}));
    expect(episodeKey(ep)).not.toBe(episodeKey({...ep,contentId:"other"}));
  });
  test("saves partial watch accurately with real duration",()=>{
    const result=saveEpisodeProgress(ep,600,1200)!;
    expect(getEpisodeStatus(result)).toBe("started");
    expect(getEpisodePercentage(result)).toBe(50);
    expect(getEpisodeProgress(ep)?.currentTime).toBe(600);
    expect(getEpisodeStatus(getEpisodeProgress({...ep,episode:2}))).toBe("unwatched");
    expect(storage.has(EPISODE_STORAGE_KEY)).toBe(true);
  });
  test("does not infer percentage from missing duration",()=>{
    const result=saveEpisodeProgress(ep,48,0)!;
    expect(getEpisodeStatus(result)).toBe("started");
    expect(getEpisodePercentage(result)).toBeNull();
  });
  test("automatically completes near the end and stays watched on replay",()=>{
    expect(getEpisodeStatus(saveEpisodeProgress(ep,1110,1200))).toBe("watched");
    expect(getEpisodePercentage(getEpisodeProgress(ep))).toBe(100);
    expect(getEpisodeStatus(saveEpisodeProgress(ep,100,1200))).toBe("watched");
  });
  test("manual watched toggle and reset allow correction",()=>{
    setEpisodeWatched(ep,true);
    expect(getEpisodeStatus(getEpisodeProgress(ep))).toBe("watched");
    expect(countWatchedEpisodes("a",ep.contentId)).toBe(1);
    setEpisodeWatched(ep,false);
    expect(getEpisodeStatus(getEpisodeProgress(ep))).toBe("unwatched");
    expect(countWatchedEpisodes("a",ep.contentId)).toBe(0);
  });
  test("legacy watch history migrates for existing users",()=>{
    storage.set("ydo-progress",JSON.stringify([{
      id:"death-note-2006-t1-e1",contentId:"death-note-2006",type:"a",
      title:"Death Note",season:1,episode:1,currentTime:300,duration:1200,updatedAt:123
    }]));
    expect(getEpisodePercentage(getEpisodeProgress(ep))).toBe(25);
    saveEpisodeProgress(ep,450,1200);
    expect(getEpisodePercentage(getEpisodeProgress(ep))).toBe(38);
  });
  test("invalid values cannot mark an episode watched",()=>{
    expect(saveEpisodeProgress({...ep,episode:0},300,1200)).toBeNull();
    expect(saveEpisodeProgress(ep,Number.NaN,0)).toBeNull();
  });
  test("updates one anime without changing a matching series ID",()=>{
    saveEpisodeProgress(ep,500,1200);
    saveEpisodeProgress({...ep,type:"s"},800,1200);
    expect(getEpisodePercentage(getEpisodeProgress(ep))).toBe(42);
    expect(getEpisodePercentage(getEpisodeProgress({...ep,type:"s"}))).toBe(67);
  });
});
