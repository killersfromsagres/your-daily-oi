/**
 * Detects how ZANG FLIX is being opened, rather than whether the device has
 * the APK installed. Browsers cannot reliably query the device's app inventory.
 *
 * The Android WebView supplied by this repository sends ZangFlixAndroid/1.1;
 * its TV variant also sends ZangFlixTV/1.1. Installed PWAs report standalone
 * (or, for some platforms, minimal-ui); iOS Home Screen apps set standalone.
 */
export interface InstalledAppSignals {
  userAgent: string;
  standaloneDisplayMode?: boolean;
  minimalUiDisplayMode?: boolean;
  iosStandalone?: boolean;
}

export function isInstalledZangFlixRuntime(signals: InstalledAppSignals): boolean {
  return /(?:^|\s)ZangFlix(?:Android|TV)\//i.test(signals.userAgent)
    || signals.standaloneDisplayMode === true
    || signals.minimalUiDisplayMode === true
    || signals.iosStandalone === true;
}

export function detectInstalledZangFlixRuntime(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const matchesMode = (mode: string) =>
    typeof window.matchMedia === "function" && window.matchMedia(`(display-mode: ${mode})`).matches;

  return isInstalledZangFlixRuntime({
    userAgent: navigator.userAgent || "",
    standaloneDisplayMode: matchesMode("standalone"),
    minimalUiDisplayMode: matchesMode("minimal-ui"),
    iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
  });
}
