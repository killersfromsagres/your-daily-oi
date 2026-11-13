// tests/sports-broadcast-verified.test.ts — dated Brazilian broadcast proof and safe in-catalog matches.
import {describe,expect,test} from "bun:test";
import {sameBroadcastFixture,verifiedBroadcastEvidence,broadcastTeamKey} from "../src/lib/broadcast-verified";
import {matchBrazilianBroadcastChannel,canonicalTvChannelIdentity} from "../src/lib/broadcast-match";
import type {JogoBrasileirao} from "../src/lib/jogos-match";
const stream="https://licensed.example.com/live";
const inventory=[
  {id:"globo-sp",nome:"TV Globo SP HD",fontes:[{url:stream}]},
  {id:"sportv1",nome:"SporTV 1 HD",fontes:[{url:stream}]},
  {id:"sportv2",nome:"SporTV 2 UHD",fontes:[{url:stream}]},
  {id:"getv",nome:"Ge TV AO VIVO",fontes:[{url:stream}]},
  {id:"stale",nome:"TV Globo",fontes:[]},
];
const g=(casa:string,fora:string,date="2026-11-14")=>({casa,fora,dataLocal:date});
describe("real Japan vs Brazil TV evidence",()=>{
 test("Brazil/Japan rights hold regardless of team order, accents or English labels",()=>{
   const a=verifiedBroadcastEvidence(g("Japan","Brazil"));
   const b=verifiedBroadcastEvidence(g("Brasil","Japão"));
   expect(a?.names).toEqual(["TV Globo","SporTV","ge TV"]);
   expect(b?.names).toEqual(a?.names);
   expect(a?.source).toMatch(/^https:\/\/www\.cnnbrasil\.com\.br\//);
 });
 test("the rights are NOT propagated to other fixtures or other dates",()=>{
   expect(verifiedBroadcastEvidence(g("Brazil","Japan","2026-11-15"))).toBeNull();
   expect(verifiedBroadcastEvidence(g("Brazil","Singapore"))).toBeNull();
   expect(verifiedBroadcastEvidence(g("Argentina","Japan"))).toBeNull();
 });
 test("match equivalent ESPN and TheSportsDB identifiers by names and kickoff",()=>{
   const a={casa:"Japão",fora:"Brasil",inicioIso:"2026-11-14T10:15:00Z"};
   const b={casa:"Brazil",fora:"Japan",inicioIso:"2026-11-14T10:10:00Z"};
   expect(sameBroadcastFixture(a,b)).toBe(true);
   expect(sameBroadcastFixture(a,{...b,inicioIso:"2026-11-15T10:10:00Z"})).toBe(false);
   expect(sameBroadcastFixture(a,{...b,fora:"France"})).toBe(false);
   expect(broadcastTeamKey("Japan")).toBe("japao");
 });
 test("every verified broadcaster maps only to an existing channel with sources",()=>{
   const rights=verifiedBroadcastEvidence(g("Japan","Brazil"))!;
   const matched=rights.names.map(name=>matchBrazilianBroadcastChannel(name,inventory)?.id);
   expect(matched).toEqual(["globo-sp","sportv1","getv"]);
 });
 test("never confuse SporTV with SporTV 2 or ESPN with a different numbered station",()=>{
   expect(matchBrazilianBroadcastChannel("SporTV",inventory.filter(c=>c.id!=="sportv1"))).toBeNull();
   expect(matchBrazilianBroadcastChannel("ESPN",inventory)).toBeNull();
   expect(canonicalTvChannelIdentity("geTV HD")).toBe("getv");
 });
 test("unavailable and unmatched rights create no clickable channel id",()=>{
   expect(matchBrazilianBroadcastChannel("SporTV",[])).toBeNull();
   expect(matchBrazilianBroadcastChannel("ge TV",inventory.filter(ch=>ch.id!=="getv"))).toBeNull();
 });
});
