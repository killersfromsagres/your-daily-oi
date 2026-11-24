import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
test("home sports shelf has no coloured banner or opaque section frame",()=>{
 const css=read("styles/home-football.css");
 expect(css).toContain(".zf-home-football::before{content:none}");
 expect(css).toContain("background:transparent;border:0;box-shadow:none");
 expect(css).not.toContain("#b72b3430");expect(css).not.toContain("#9b20252c");
 expect(css).toContain("height:calc(100% + var(--zf-feature-extension))");
 expect(css).toContain("filter:brightness(0) invert(1)");
});
test("web and TV place the sports shelf inside the continuous hero surface",()=>{
 const web=read("routes/index.tsx"),tv=read("routes/tv-home.tsx");
 expect(web.indexOf('className="zf-home-feature-stack"')).toBeLessThan(web.indexOf("<HeroSection items="));
 expect(web.indexOf("<HomeFootball onWatch=")).toBeLessThan(web.indexOf('className="ydo-catalog"'));
 expect(tv).toContain('className="zf-home-feature-stack is-tv"');
 expect(tv).toContain('<HomeFootball television onWatch=');
 expect(read("styles/home-football.css")).toContain("backdrop-filter:none;-webkit-backdrop-filter:none");
});
