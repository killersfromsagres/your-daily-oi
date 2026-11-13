// tests/apple-glass-nav.test.ts — final glass override must remain truly translucent.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const css = readFileSync("src/styles/apple-glass-nav.css","utf8");
const root = readFileSync("src/routes/__root.tsx","utf8");
const header = readFileSync("src/components/layout/Header.tsx","utf8");
const adaptive = readFileSync("src/styles/adaptive-navigation.css","utf8");

describe("ZANG FLIX Apple-style liquid glass",()=>{
  test("the true glass override loads after every older navigation stylesheet",()=>{
    expect(root).toContain('import appleGlassNavCss from "../styles/apple-glass-nav.css?url";');
    const link=root.indexOf('href: appleGlassNavCss');
    expect(link).toBeGreaterThan(root.indexOf('href: liquidGlassNavCss'));
    expect(link).toBeGreaterThan(root.indexOf('href: navPremiumCss'));
    expect(link).toBeGreaterThan(root.indexOf('href: mobileAppCss'));
  });
  test("glass surfaces use low-alpha backgrounds and real blur, not opaque blocks",()=>{
    expect(css).toContain("--zf-glass-bg: rgba(225, 235, 255, .075)");
    expect(css).toContain("backdrop-filter: blur(32px)");
    expect(css).toContain("backdrop-filter: blur(31px)");
    expect(css).toContain("-webkit-backdrop-filter: blur(32px)");
    expect(css).not.toContain("rgba(13,16,26,.94)");
    expect(css).not.toContain("rgba(20,24,35,.75)");
  });
  test("no legacy mobile !important rule can erase glass or force opaque navy fills",()=>{
    expect(adaptive).not.toContain("background-color: #131b29 !important");
    expect(adaptive).not.toContain("background: #111a28 !important");
    expect(adaptive).not.toContain("background: #121c2b !important");
    expect(adaptive).not.toContain(".ydo-header, .zf-mobile-dock, .zf-mobile-menu-panel,");
    expect(adaptive).toContain(".ztv-guide-overlay, .ztv-explore-glass");
  });
  test("header remains mobile-width aligned and preserves scroll-to-hide logic",()=>{
    expect(css).toContain("left: 10px;");
    expect(css).toContain("right: 10px;");
    expect(header).toContain('transform: platform === "mobile"');
  });
  test("5 tabs, neutral active pill and detached circular search are styled",()=>{
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(css).toContain(".zf-mobile-tab.is-active");
    expect(css).toContain(".zf-mobile-search-fab");
    expect(css).toContain("border-radius: 50%");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
  });
  test("accessibility and browser fallback are included",()=>{
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("@supports not ((backdrop-filter: blur(1px))");
  });
});
