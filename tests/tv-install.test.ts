import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {detectTvInstallPlatform} from "../src/lib/tv-install";

describe("Television installation targets",()=>{
 test("keeps Roku TCL distinct from TCL Android/Google TV",()=>{
   expect(detectTvInstallPlatform("Roku/DVP-12.5 (5200X); TCL")).toBe("tcl-roku");
   expect(detectTvInstallPlatform("Mozilla/5.0 (Linux; Android TV 12; TCL)")).toBe("tcl-android");
   expect(detectTvInstallPlatform("GoogleTV; TCL 2025")).toBe("tcl-android");
 });
 test("detects Samsung and LG OS, not based on screen width",()=>{
   expect(detectTvInstallPlatform("Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0)")).toBe("samsung");
   expect(detectTvInstallPlatform("Mozilla/5.0 (Web0S; Linux; LG)")).toBe("lg");
 });
 test("has a usable page with separate installation instructions",()=>{
   const page=readFileSync(new URL("../src/routes/tv-app.tsx",import.meta.url),"utf8");
   expect(page).toContain("selected===\"tcl-android\"");
   expect(page).toContain("selected===\"samsung\"");
   expect(page).toContain("selected===\"lg\"");
   expect(page).toContain("selected===\"tcl-roku\"");
   expect(page).toContain("ZANG-FLIX-TV.apk");
   expect(page).toContain("Developer Mode");
   expect(page).not.toContain("Instalar APK na Samsung");
 });
});
