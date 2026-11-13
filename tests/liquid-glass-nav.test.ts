// tests/liquid-glass-nav.test.ts — regression checks for ZANG FLIX responsive glass navigation.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const stylesheet = readFileSync("src/styles/liquid-glass-nav.css","utf8");
const root = readFileSync("src/routes/__root.tsx","utf8");
const header = readFileSync("src/components/layout/Header.tsx","utf8");
const mobile = readFileSync("src/components/layout/MobileNavigation.tsx","utf8");

describe("Apple-inspired ZANG FLIX glass navigation", () => {
  test("loads final glass overrides after older navigation styles", () => {
    expect(root).toContain('import liquidGlassNavCss from "../styles/liquid-glass-nav.css?url"');
    expect(root.indexOf('href: liquidGlassNavCss')).toBeGreaterThan(root.indexOf('href: navPremiumCss'));
  });
  test("real glass uses backdrop blur and translucent surfaces", () => {
    expect(stylesheet).toContain("-webkit-backdrop-filter:blur(27px)");
    expect(stylesheet).toContain("backdrop-filter:blur(25px)");
    expect(stylesheet).toContain("rgba(50,50,53,.43)");
  });
  test("mobile header no longer inherits desktop negative half-width translation", () => {
    expect(header).toContain('transform: platform === "mobile"');
    expect(stylesheet).toContain('left:10px;');
    expect(stylesheet).toContain('right:10px;');
  });
  test("dock has five working destinations while search remains in the header", () => {
    expect(stylesheet).toContain("grid-template-columns:repeat(5,minmax(0,1fr))");
    expect(mobile).toContain('to="/generos/$slug" params={{slug:"filmes"}}');
    expect(mobile).toContain('to="/generos/$slug" params={{slug:"series"}}');
    expect(mobile).toContain('to="/animes"');
    expect(mobile).toContain('to="/tv"');
    expect(mobile).not.toContain('className={"zf-mobile-search-fab"');
    expect(header).toContain('className="ydo-search-trigger-btn"');
  });
  test("selected section uses neutral translucent capsule, without blue", () => {
    expect(stylesheet).toContain('.zf-mobile-tab.is-active');
    expect(stylesheet).toContain('background:linear-gradient(180deg,rgba(255,255,255,.18)');
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{6}.*blue/);
  });
  test("respects Android safe areas, accessibility and fallback", () => {
    expect(stylesheet).toContain("env(safe-area-inset-bottom,0px)");
    expect(stylesheet).toContain(":focus-visible");
    expect(stylesheet).toContain("@supports not ((backdrop-filter:");
    expect(stylesheet).toContain("prefers-reduced-motion");
  });
});
