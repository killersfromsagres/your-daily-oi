// tests/device-profile.test.ts — bun tests for mobile/desktop/Smart TV classification.
import { describe, expect, test } from "bun:test";
import { detectDeviceProfile, isWatchRoute, mobileTabActive, type DeviceSignals } from "../src/lib/device-profile";
import { spatialFocusScore } from "../src/lib/tv-remote";

const base: DeviceSignals = { userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124", viewportWidth:1440, coarsePointer:false, touchPoints:0 };
describe("Zang Flix adaptive device selection", () => {
  test("recognizes mobile phones and tablets by viewport and capability", () => {
    expect(detectDeviceProfile({ ...base, viewportWidth:390 })).toBe("mobile");
    expect(detectDeviceProfile({ ...base, viewportWidth:1024, coarsePointer:true,touchPoints:5 })).toBe("mobile");
    expect(detectDeviceProfile({ ...base, viewportWidth:1024, userAgent:"Mozilla/5.0 (iPad; CPU OS 17_0)" })).toBe("mobile");
  });
  test("keeps normal desktop and resized desktop distinct", () => {
    expect(detectDeviceProfile(base)).toBe("web");
    expect(detectDeviceProfile({ ...base, viewportWidth:820 })).toBe("mobile");
    expect(detectDeviceProfile({ ...base, viewportWidth:1920, coarsePointer:true })).toBe("web");
  });
  test("TV wins over viewport sizes and touch behavior", () => {
    for (const userAgent of ["Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)", "Mozilla/5.0 (Web0S; LG TV)", "Roku/DVP-12", "Mozilla/5.0 (Linux; Android TV 13; BRAVIA)", "Mozilla/5.0 (AFTMM; Android)", "Mozilla/5.0 (AppleTV; CPU OS 16_0)"]) {
      expect(detectDeviceProfile({ ...base, userAgent, viewportWidth:720 })).toBe("tv");
    }
  });
  test("keeps watch routes free of fixed mobile navigation", () => {
    expect(isWatchRoute("/assistir/anime/123/1/1")).toBe(true);
    expect(isWatchRoute("/tv")).toBe(false);
    expect(mobileTabActive("/tv/canal/band", "tv")).toBe(true);
    expect(mobileTabActive("/futebol", "games")).toBe(true);
    expect(mobileTabActive("/minha-lista", "home")).toBe(false);
  });
});
describe("TV remote focus scoring", () => {
  const origin = {left:100,top:100,width:70,height:50};
  test("rejects targets behind direction", () => {
    expect(spatialFocusScore(origin,{left:10,top:100,width:40,height:40},"right")).toBeNull();
    expect(spatialFocusScore(origin,{left:100,top:20,width:40,height:40},"down")).toBeNull();
  });
  test("prefers aligned focusable controls", () => {
    const aligned = spatialFocusScore(origin,{left:220,top:100,width:60,height:50},"right")!;
    const diagonal = spatialFocusScore(origin,{left:210,top:260,width:60,height:50},"right")!;
    expect(aligned).toBeLessThan(diagonal);
  });
});
