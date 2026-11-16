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
  test("installed runtime suppresses duplicate APK offers",()=>{
    const install=readFileSync(new URL("../src/components/layout/InstallAppButton.tsx",import.meta.url),"utf8");
    expect(install).toContain('platform === "checking" || platform === "installed"');
    expect(install).toContain("detectInstalledZangFlixRuntime()");
  });
});
