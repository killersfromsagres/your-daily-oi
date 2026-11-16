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
  /** Running in a packaged webOS/Tizen host, not the TV's ordinary browser. */
  installedTvWrapper?: boolean;
}

export function isInstalledZangFlixRuntime(signals: InstalledAppSignals): boolean {
  return /(?:^|\s)ZangFlix(?:Android|TV)\//i.test(signals.userAgent)
    || signals.standaloneDisplayMode === true
    || signals.minimalUiDisplayMode === true
    || signals.iosStandalone === true
    || signals.installedTvWrapper === true;
}

export function detectInstalledZangFlixRuntime(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const matchesMode = (mode: string) =>
    typeof window.matchMedia === "function" && window.matchMedia(`(display-mode: ${mode})`).matches;

  // The official webOS hosted shell forwards this marker once on launch.
  // sessionStorage keeps the installed context across client-side routes; a
  // regular Samsung/LG TV browser with a TV user agent remains a browser.
  let hosted = false;
  try {
    const launch = new URL(window.location.href).searchParams.get("zf-tv-app");
    if (launch === "webos" || launch === "tizen") {
      window.sessionStorage.setItem("zf-installed-tv-app", launch);
      window.localStorage.setItem("zf-tv-mode", "true");
      hosted = true;
    } else {
      hosted = ["webos","tizen"].includes(window.sessionStorage.getItem("zf-installed-tv-app") || "");
    }
  } catch { /* storage can be blocked on some TV engines */ }
  return isInstalledZangFlixRuntime({
    userAgent: navigator.userAgent || "",
    standaloneDisplayMode: matchesMode("standalone"),
    minimalUiDisplayMode: matchesMode("minimal-ui"),
    iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    installedTvWrapper: hosted,
  });
}
