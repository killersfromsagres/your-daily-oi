import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
describe("TV packages and truthful installation capabilities",()=>{
 test("LG hosted shell has required fields and secure redirect",()=>{
   const info=JSON.parse(readFileSync(new URL("../tv/lg-webos/appinfo.json",import.meta.url),"utf8"));
   const html=readFileSync(new URL("../tv/lg-webos/index.html",import.meta.url),"utf8");
   expect(info.id).toBe("com.zangflix.tv");
   expect(info.type).toBe("web");
   expect(info.main).toBe("index.html");
   expect(info.icon).toBe("icon.png");
   expect(html).toContain("https://zangflix.lovable.app/tv-home?zf-tv-app=webos");
 });
 test("CI builds LG webOS IPK using official CLI",()=>{
   const ci=readFileSync(new URL("../.github/workflows/webos-package.yml",import.meta.url),"utf8");
   expect(ci).toContain("@webos-tools/cli");
   expect(ci).toContain("ares-package tv/lg-webos");
   expect(ci).toContain("ZANG-FLIX-webOS.ipk");
 });
 test("Samsung dev project has TV profile but no false Android APK option",()=>{
   const xml=readFileSync(new URL("../tv/samsung-tizen/config.xml",import.meta.url),"utf8");
   expect(xml).toContain('tizen:profile name="tv-samsung"');
   expect(xml).toContain("http://tizen.org/privilege/internet");
   expect(xml).not.toContain(".apk");
 });
});
