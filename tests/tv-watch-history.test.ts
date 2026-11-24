import { describe, expect, test } from "bun:test";
import {tvNextEpisode,tvPercent,tvTime} from "../src/lib/tv-watch-history";
import {tvGridColumns} from "../src/lib/tv-grid";
import type {CatalogItem} from "../src/lib/types";
import type {EpisodeRecord} from "../src/lib/episode-progress";
const item:CatalogItem={id:"series-a",title:"Série",type:"s",genres:[],streams:[],seasons:[{seasonNumber:1,episodes:[{seasonNumber:1,episodeNumber:1,streams:[]},{seasonNumber:1,episodeNumber:2,streams:[]}]},{seasonNumber:2,episodes:[{seasonNumber:2,episodeNumber:1,streams:[]}]}]};
const rec=(season:number,episode:number,completed:boolean,updatedAt:number):EpisodeRecord=>({type:"s",contentId:item.id,season,episode,completed,updatedAt,currentTime:completed?100:35,duration:100});
describe("TV resume",()=>{
 test("first unseen episode",()=>expect(tvNextEpisode(item,new Map())?.episodeNumber).toBe(1));
 test("resumes latest in progress",()=>expect(tvNextEpisode(item,new Map([["1:1",rec(1,1,true,1)],["1:2",rec(1,2,false,2)]]))?.episodeNumber).toBe(2));
 test("moves into next season",()=>expect(tvNextEpisode(item,new Map([["1:1",rec(1,1,true,1)],["1:2",rec(1,2,true,2)]]))?.seasonNumber).toBe(2));
 test("progress and time format",()=>{expect(tvPercent({currentTime:35,duration:100})).toBe(35);expect(tvTime(3720)).toBe("1h 02min");});
 test("episode focus grid matches CSS",()=>{expect(tvGridColumns(600,"episodes")).toBe(2);expect(tvGridColumns(880,"episodes")).toBe(3);expect(tvGridColumns(1920,"episodes")).toBe(4);});
});
