import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
const get=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("Premium TV installation UI",()=>{
 test("uses approved vector marks and descriptive platform labels",()=>{
   const route=get("../src/routes/tv-app.tsx");
   for(const name of ["samsung","lg","roku"]) {
     expect(get("../public/tv-brands/"+name+".svg")).toContain("<svg");
     expect(route).toContain('"/tv-brands/'+name+'.svg"');
   }
   expect(route).toContain("Logo_of_the_TCL_Corporation.svg");
   expect(route).toContain('aria-pressed={selected===device.id}');
   expect(route).toContain('aria-controls="zf-tv-install-panel"');
   expect(route).toContain("onKeyDown={onDeviceKeys}");
   expect(route).toContain('data-tv-device={device.id}');
   expect(route).toContain('loading="lazy"');
 });
 test("cinematic illustrative preview is not mislabeled as a real screenshot",()=>{
   const route=get("../src/routes/tv-app.tsx");
   const css=get("../src/styles/tv-app-premium.css");
   expect(route).toContain("PRÉVIA ILUSTRATIVA DA INTERFACE");
   expect(route).toContain('aria-hidden="true"');
   expect(css).toContain(".zf-tv-premium-hero");
   expect(css).toContain(".zf-tv-hardware");
   expect(css).toContain(".zf-tv-remote");
   expect(css).toContain("prefers-reduced-motion:reduce");
 });
 test("mobile grid remains touch accessible and CSS loads after existing styles",()=>{
   const css=get("../src/styles/tv-app-premium.css");
   const root=get("../src/routes/__root.tsx");
   expect(css).toContain("@media(max-width:470px)");
   expect(css).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
   expect(css).toContain(":focus-visible");
   expect(root).toContain('href: tvAppPremiumCss');
   expect(root.indexOf('href: tvAppPremiumCss')).toBeGreaterThan(root.indexOf('href: tvExperienceCss'));
 });
 test("does not claim that unsupported Samsung or Roku APKs are installable",()=>{
   const route=get("../src/routes/tv-app.tsx");
   expect(route).toContain('status:"Versão web"');
   expect(route).toContain('status:"App Roku pendente"');
   expect(route).toContain("não instala APK Android");
   expect(route).toContain("não roda aplicativos Android");
 });
});
