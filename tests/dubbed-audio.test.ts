import {describe,expect,test} from "bun:test";
import {dubbedVodSources,isDubbedVodSource,portugueseAudioTrack} from "../src/lib/dubbed-audio";
import {bestVodSourceIndex,nextVodSourceIndex,shortlistVodSources,betterMeasuredVodSourceIndex} from "../src/lib/vod-source-quality";
import type {StreamSource} from "../src/lib/types";
const dub:StreamSource={url:"https://cdn.test/dub.mp4",audio:"dub",quality:"720p"};
const leg:StreamSource={url:"https://cdn.test/leg.mp4",audio:"leg",quality:"4K"};
describe("dubbed-only VOD policy",()=>{
 test("no subtitle fallback when the only dub fails or is missing",()=>{
  expect(bestVodSourceIndex([leg])).toBe(-1);
  expect(nextVodSourceIndex([dub,leg],0,new Set())).toBe(-1);
  expect(shortlistVodSources([leg])).toEqual([]);
 });
 test("foreign versions and unverified audio cannot masquerade as DUB",()=>{
  expect(isDubbedVodSource({...dub,url:"/api/saimo-vod?versao=leg"})).toBe(false);
  expect(isDubbedVodSource({...dub,name:"Servidor LEG"})).toBe(false);
  expect(isDubbedVodSource({...dub,audioDeclared:false})).toBe(false);
  expect(isDubbedVodSource({...dub,url:"/api/saimo-vod?versao=dub",audioDeclared:false})).toBe(false);
  expect(dubbedVodSources([leg,dub])).toEqual([dub]);
 });
 test("selects Portuguese in a dual-audio manifest and identifies foreign-only audio",()=>{
  expect(portugueseAudioTrack([{lang:"en",name:"English"},{lang:"pt-BR",name:"Português"}])).toEqual({index:1,foreign:true});
  expect(portugueseAudioTrack([{lang:"ja",name:"日本語"}])).toEqual({index:-1,foreign:true});
  expect(portugueseAudioTrack([])).toEqual({index:-1,foreign:false});
 });
 test("restores a measured sharper dub when a 4K-labelled source delivers only SD",()=>{
  const advertised={...dub,url:"https://cdn.test/fake4k.mp4",quality:"4K"};
  const heights=new Map([[dub.url,1080],[advertised.url,360]]);
  expect(betterMeasuredVodSourceIndex([dub,advertised,leg],1,heights)).toBe(0);
  expect(betterMeasuredVodSourceIndex([dub,advertised],1,heights,new Set([dub.url]))).toBe(-1);
 });
});
