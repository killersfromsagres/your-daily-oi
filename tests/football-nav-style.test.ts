// tests/football-nav-style.test.ts — regression for neutral football navigation.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const base = new URL("../src/styles/", import.meta.url);
const footballCss = readFileSync(new URL("football-center.css", base), "utf8");
const headerCss = readFileSync(new URL("header.css", base), "utf8");

describe("Jogos do Dia visual", () => {
  test("football center no longer overrides the button with green styles or pulse", () => {
    const navigation = footballCss.split(".zf-football-inline-link")[0];
    expect(navigation).toContain(".ydo-nav-football");
    expect(navigation).not.toMatch(/animation:\\s*.*(?:pulse|infinite)/);
    expect(navigation).not.toMatch(/background:\\s*(?:linear-gradient|#(?:0f|1a|2f))/);
    expect(navigation).not.toMatch(/!important/);
    expect(navigation).not.toMatch(/rgba\\(9[0-9],\\s*23[0-9],\\s*1[0-9]{2}/);
    expect(navigation).not.toContain("drop-shadow");
  });

  test("only HOJE text animates opacity without overriding its color", () => {
    const todayRule = headerCss.match(
      /\\.ydo-header \\.ydo-nav-football \\.ydo-football-today \\{([^}]*)\\}/,
    );
    expect(todayRule).toBeTruthy();
    expect(todayRule?.[1]).toContain("animation: zang-today-blink");
    expect(todayRule?.[1]).not.toContain("color:");
    const keyframes = headerCss.match(/@keyframes zang-today-blink \\{([\\s\\S]*?)\\n\\}/);
    expect(keyframes).toBeTruthy();
    expect(keyframes?.[1]).toContain("opacity:");
    expect(keyframes?.[1]).not.toContain("color:");
    expect(headerCss).toContain(".ydo-football-today { animation:none; }");
  });
});
