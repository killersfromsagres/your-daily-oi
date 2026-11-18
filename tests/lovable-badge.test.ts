import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Lovable publishing badge visual suppression", () => {
  test("global CSS targets only the host-injected badge", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
    expect(styles).toMatch(/#lovable-badge\s*\{[^}]*display:\s*none\s*!important/s);
    expect(styles).toMatch(/#lovable-badge\s*\{[^}]*pointer-events:\s*none\s*!important/s);
    expect(root).toContain('import appCss from "../styles.css?url"');
    expect(root).toContain('{ rel: "stylesheet", href: appCss }');
  });
});
