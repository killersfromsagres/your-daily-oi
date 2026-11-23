import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
describe("Site install button placement",()=>{
  test("renders in the desktop header and in the separate mobile toolbar",()=>{
    const header=readFileSync(new URL("../src/components/layout/Header.tsx",import.meta.url),"utf8");
    expect(header).toContain("<InstallAppButton />");
    expect(header).not.toContain('{platform === "mobile" && <InstallAppButton />}');
    expect(header).toContain('{platform !== "mobile" && searchActions}');
    expect(header).toContain('className={"zf-mobile-floating-actions"');
  });
  test("Android installer keeps APK download, and packaged app opens Lovable",()=>{
    const install=readFileSync(new URL("../src/components/layout/InstallAppButton.tsx",import.meta.url),"utf8");
    const native=readFileSync(new URL("../android/app/src/main/java/com/zangflix/app/MainActivity.java",import.meta.url),"utf8");
    const gradle=readFileSync(new URL("../android/app/build.gradle.kts",import.meta.url),"utf8");
    const page=readFileSync(new URL("../src/routes/tv-app.tsx",import.meta.url),"utf8");
    expect(install).toContain("releases/download/android-latest/ZANG-FLIX-Android.apk");
    expect(native).toContain('HOME = "https://zangflix.lovable.app/"');
    expect(native).toContain('"zangflix.lovable.app".equals(uri.getHost())');
    expect(native).not.toContain("zangflix.vercel.app");
    expect(gradle).toContain("versionCode = 10");
    expect(gradle).toContain('applicationId = "com.zangflix.tv"');
    expect(native).toContain('TV_HOME = "https://zangflix.lovable.app/tv-home');
    expect(page).toContain("https://zangflix.lovable.app/tv-home");
    expect(page).not.toContain("zangflix.vercel.app");
  });
  test("installed runtime suppresses duplicate APK offers",()=>{
    const install=readFileSync(new URL("../src/components/layout/InstallAppButton.tsx",import.meta.url),"utf8");
    expect(install).toContain('platform === "checking" || platform === "installed"');
    expect(install).toContain("detectInstalledZangFlixRuntime()");
  });
});
