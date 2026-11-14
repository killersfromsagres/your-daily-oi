import { describe, expect, test } from "bun:test";
import { isInstalledZangFlixRuntime } from "./app-runtime";

describe("ZANG FLIX install-button runtime detection", () => {
  const androidChrome = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
  const iphoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1";

  test("shows download in an ordinary Android mobile browser", () => {
    expect(isInstalledZangFlixRuntime({ userAgent: androidChrome })).toBe(false);
  });

  test("shows installation instructions in an ordinary iPhone browser", () => {
    expect(isInstalledZangFlixRuntime({ userAgent: iphoneSafari })).toBe(false);
  });

  test("hides download inside the installed native Android APK", () => {
    expect(isInstalledZangFlixRuntime({ userAgent: androidChrome + " ZangFlixAndroid/1.1" })).toBe(true);
  });

  test("hides download inside the installed Android TV APK", () => {
    expect(isInstalledZangFlixRuntime({ userAgent: androidChrome + " ZangFlixAndroid/1.1 ZangFlixTV/1.1" })).toBe(true);
  });

  test("hides download when a PWA launches in standalone mode", () => {
    expect(isInstalledZangFlixRuntime({ userAgent: androidChrome, standaloneDisplayMode: true })).toBe(true);
  });

  test("hides download in iOS Home Screen apps", () => {
    expect(isInstalledZangFlixRuntime({ userAgent: iphoneSafari, iosStandalone: true })).toBe(true);
  });

  test("supports PWAs using minimal-ui", () => {
    expect(isInstalledZangFlixRuntime({ userAgent: androidChrome, minimalUiDisplayMode: true })).toBe(true);
  });

  test("browser remains a browser even when the APK is also installed on the phone", () => {
    expect(isInstalledZangFlixRuntime({
      userAgent: androidChrome,
      standaloneDisplayMode: false,
      iosStandalone: false,
    })).toBe(false);
  });
});
