// tests/reference-glass-dock.test.ts — reference-inspired mobile capsule contract.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const nav=readFileSync("src/components/layout/MobileNavigation.tsx","utf8");
const header=readFileSync("src/components/layout/Header.tsx","utf8");
const css=readFileSync("src/styles/reference-glass-dock.css","utf8");
const root=readFileSync("src/routes/__root.tsx","utf8");

describe("ZANG FLIX reference glass mobile dock",()=>{
  test("five centered destinations without a search button in the bottom dock",()=>{
    const begin=nav.indexOf('<nav className="zf-mobile-dock"');
    const end=nav.indexOf("</nav>",begin);
    const dock=nav.slice(begin,end);
    expect(dock.match(/className=\{"zf-mobile-tab"/g)?.length).toBe(4);
    expect(dock).toContain('className={"zf-mobile-tab zf-mobile-live"');
    expect(dock).not.toContain("zf-mobile-search-fab");
    expect(header).toContain('className="ydo-search-trigger-btn"');
    expect(header).toContain('className="ydo-search-input"');
    expect(dock).toContain('to="/generos/$slug" params={{slug:"filmes"}}');
    expect(dock).toContain('to="/generos/$slug" params={{slug:"series"}}');
    expect(dock).toContain('to="/animes"');
    expect(dock).toContain('to="/tv"');
    expect(dock).toContain('to="/"');
    expect(nav.slice(end+6,nav.indexOf("{open &&",end))).not.toContain("zf-mobile-search-fab");
  });
  test("last loaded stylesheet guarantees single translucent smoked-glass shell",()=>{
    expect(root).toContain('import referenceGlassDockCss from "../styles/reference-glass-dock.css?url";');
    const newSheet=root.indexOf("href: referenceGlassDockCss");
    expect(newSheet).toBeGreaterThan(root.indexOf("href: appleGlassNavCss"));
    expect(css).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(css).toContain("rgba(5, 26, 31, .55)");
    expect(css).toContain("backdrop-filter: blur(38px)");
    expect(css).toContain("-webkit-backdrop-filter: blur(38px)");
    expect(css).toContain("border-radius: 999px");
    expect(css).toContain("left: 50%");
    expect(css).toContain("translate3d(-50%, 0, 0)");
    expect(css).toContain("width: min(470px, calc(100vw - 32px))");
    expect(css).not.toContain("rgb(0, 122, 255)");
    expect(css).not.toContain("background: #101722");
  });
  test("icons are screenreader-readable but visibly icon-only and route-aware",()=>{
    expect(nav).toContain('aria-current={mobileTabActive(pathname,"home") ? "page" : undefined}');
    expect(nav).toContain('title="Animes"');
    expect(nav).toContain('title="Séries"');
    expect(nav).toContain('title="TV ao vivo"');
    expect(css).toContain("clip-path: inset(50%)");
    expect(css).toContain(":focus-visible");
  });
  test("safe areas, minimum screen, PWA and landscape remain supported",()=>{
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(css).toContain("@media (max-width: 370px)");
    expect(css).toContain("@media (max-height: 530px) and (orientation: landscape)");
    expect(css).toContain('html:not([data-zf-platform="tv"])');
    expect(css).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(css).toContain("prefers-reduced-motion");
  });
});
