// tests/fullscreen-orientation.test.ts — orientation strategy in supported and unsupported mobile browsers.
import { describe, expect, test } from "bun:test";
import {
  isMobileLandscapeTarget, shouldRotateFullscreenFallback,
  tryLockLandscape, unlockLandscape, fullscreenProgressFraction,
} from "../src/lib/fullscreen-orientation";

describe("landscape fullscreen on mobile", () => {
  test("recognizes phone environments without rotating desktop web players", () => {
    expect(isMobileLandscapeTarget({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      viewportWidth: 390, coarsePointer: true,
    })).toBe(true);
    expect(isMobileLandscapeTarget({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile",
      viewportWidth: 412, coarsePointer: true,
    })).toBe(true);
    expect(isMobileLandscapeTarget({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      viewportWidth: 1920, coarsePointer: false,
    })).toBe(false);
    expect(isMobileLandscapeTarget({
      userAgent: "Mozilla/5.0 (SMART-TV; Tizen)", viewportWidth: 1920, coarsePointer: false,
    })).toBe(false);
  });
  test("does not rotate a narrow touch desktop or Android TV",()=>{
    expect(isMobileLandscapeTarget({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",viewportWidth:700,coarsePointer:true})).toBe(false);
    expect(isMobileLandscapeTarget({userAgent:"Mozilla/5.0 (Linux; Android 14; Android TV)",viewportWidth:800,coarsePointer:true})).toBe(false);
  });
  test("seeking follows the visible timeline when the player is rotated",()=>{
    const rect={left:5,top:20,width:4,height:800};
    expect(fullscreenProgressFraction({clientX:7,clientY:420,rotated:true,rect})).toBe(.5);
    expect(fullscreenProgressFraction({clientX:7,clientY:900,rotated:true,rect})).toBe(1);
    expect(fullscreenProgressFraction({clientX:7,clientY:0,rotated:true,rect})).toBe(0);
    expect(fullscreenProgressFraction({clientX:405,clientY:22,rotated:false,rect:{...rect,width:800,height:4}})).toBe(.5);
  });
  test("locks landscape when the device permits it", async () => {
    let locked = "";
    let unlocked = false;
    const orientation = {
      lock: async (mode: "landscape") => { locked = mode; },
      unlock: () => { unlocked = true; },
    };
    expect(await tryLockLandscape(orientation)).toBe(true);
    expect(locked).toBe("landscape");
    unlockLandscape(orientation);
    expect(unlocked).toBe(true);
  });
  test("falls back without throwing when unavailable or rejected", async () => {
    expect(await tryLockLandscape(undefined)).toBe(false);
    expect(await tryLockLandscape({lock: async () => {throw Error("NotAllowedError");}})).toBe(false);
    expect(shouldRotateFullscreenFallback({mobile:true, portrait:true, orientationLocked:false})).toBe(true);
    expect(shouldRotateFullscreenFallback({mobile:true, portrait:true, orientationLocked:true})).toBe(false);
    expect(shouldRotateFullscreenFallback({mobile:true, portrait:false, orientationLocked:false})).toBe(false);
    expect(shouldRotateFullscreenFallback({mobile:false, portrait:true, orientationLocked:false})).toBe(false);
    expect(() => unlockLandscape({unlock: () => {throw Error("InvalidStateError");}})).not.toThrow();
  });
});
