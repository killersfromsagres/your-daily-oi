import {describe,expect,test} from "bun:test";
import {matchBrazilianBroadcastChannel,normalizeTvChannelIdentity} from "../src/lib/broadcast-match";
const channels=[
  {id:"premiere1",nome:"Premiere 1 HD",fontes:[{url:"https://tv.example/1"}]},
  {id:"premiereclubes",nome:"Premiere Clubes FHD",fontes:[{url:"https://tv.example/clubes"}]},
  {id:"sportv2",nome:"SporTV 2 HD",fontes:[{url:"https://tv.example/sportv2"}]},
  {id:"espn",nome:"ESPN HD",fontes:[{url:"https://tv.example/espn"}]},
  {id:"espnplus",nome:"ESPN+",fontes:[{url:"https://tv.example/espnplus"}]},
  {id:"globo",nome:"TV Globo FHD",fontes:[{url:"https://tv.example/globo"}]},
  {id:"offline",nome:"Premiere",fontes:[]},
];
describe("TV identity matching confirmed broadcasts",()=>{
 test("maps quality, sportv, ESPN Brasil and Globo aliases",()=>{
   expect(normalizeTvChannelIdentity("Sport TV 2 UHD")).toBe("sportv 2");
   expect(matchBrazilianBroadcastChannel("Sport TV 2",channels)?.id).toBe("sportv2");
   expect(matchBrazilianBroadcastChannel("ESPN Brasil",channels)?.id).toBe("espn");
   expect(matchBrazilianBroadcastChannel("Globo",channels)?.id).toBe("globo");
   expect(matchBrazilianBroadcastChannel("Premiere Clubes",channels)?.id).toBe("premiereclubes");
 });
 test("does not mislabel numbered channels and ESPN+",()=>{
   expect(matchBrazilianBroadcastChannel("Premiere",channels)).toBeNull();
   expect(matchBrazilianBroadcastChannel("Premiere 2",channels)).toBeNull();
   expect(matchBrazilianBroadcastChannel("ESPN 2",channels)).toBeNull();
   expect(matchBrazilianBroadcastChannel("ESPN+",channels)?.id).toBe("espnplus");
 });
});
