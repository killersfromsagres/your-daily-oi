import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
describe("TV native app must not change web and mobile",()=>{
 test("cinema CSS is loaded exclusively on TV-only routes, never in global head",()=>{
   const root=read("../src/routes/__root.tsx");
   expect(root).not.toContain('import tvCinemaCss from "../styles/tv-cinema.css?url"');
   expect(root).not.toContain('href: tvCinemaCss');
   for(const route of ["tv-home","tv-live","tv-title"]){
     const s=read("../src/routes/"+route+".tsx");
     expect(s).toContain('import tvCinemaCss from "../styles/tv-cinema.css?url"');
     expect(s).toContain('links:[{rel:"stylesheet",href:tvCinemaCss}]');
   }
 });
 test("web player is not wired to native-TV performance flags",()=>{
   const web=read("../src/components/player/LivePlayer.tsx");
   expect(web).not.toContain("preferNativeDecoder");
   const tv=read("../src/routes/tv-live.tsx");
   expect(tv).toContain("TvStreamPlayer");
   expect(tv).not.toContain("<LivePlayer");
 });
 test("web and mobile routes retain their header, and native TV routes do not",()=>{
   const root=read("../src/routes/__root.tsx");
   expect(root).toContain('["/tv-home", "/tv-live", "/tv-title"].includes(pathname)');
   expect(root).toContain("!isDedicatedTvHome && !tvWatch && <Header />");
   expect(root).toContain("!isDedicatedTvHome && !tvWatch && <div className=");
   const tv=read("../src/routes/tv-home.tsx");
   expect(tv).toContain('data-tv-exclusive="true"');
   expect(read("../android/app/src/main/java/com/zangflix/app/MainActivity.java")).toContain("/tv-home?zf-tv-app=androidtv");
 });
});
